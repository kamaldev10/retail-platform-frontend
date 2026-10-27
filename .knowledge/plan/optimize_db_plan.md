# Rencana Optimasi & Migrasi Database: Gasoline Web

- Document ID: PLAN-DB-OPT-001
- Created At: 2026-10-25
- Last Updated: 2026-10-27
- Status: On Going
- Target Scope: `packages/database`, `apps/gasoline-web`

---

## 1. Sasaran & Keputusan Arsitektur Baru

### A. Penggabungan Tabel Fragmented (`active_shift` + `live_stock` + `recaps` ➔ `shifts`)

- **Masalah Lama**:
  - `gasoline.active_shift` berupa baris singleton sementara yang dihapus saat closing shift.
  - `gasoline.live_stock` hanya menyimpan kuantitas terkini tanpa relasi tanggal, tanpa histori stok kemarin.
  - `gasoline.recaps` tidak menyimpan histori stok jerigen, dan kolom kasnya rancu (`cash_in` diisi kas akhir laci).
- **Keputusan Arsitektur**:
  - Menggabungkan konsep shift aktif, stok live, dan rekap penutupan harian ke dalam satu entitas: `gasoline.shifts` dan child table `gasoline.shift_product_stocks`.
  - Tabel usang yang akan didegradasi / dihapus (`DROP`):
    - `gasoline.active_shift`
    - `gasoline.live_stock`
    - `gasoline.recaps` (dimigrasikan ke `gasoline.shifts`)
    - `gasoline.product_recaps` (dimigrasikan ke `gasoline.shift_product_stocks`)

---

## 2. Spesifikasi DDL Skema Database Terpadu

### A. Tabel Master Produk (`gasoline.products`)

```sql
CREATE TABLE IF NOT EXISTS gasoline.products (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    volume NUMERIC(12, 3) NOT NULL DEFAULT 1.000,
    selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    margin NUMERIC(15, 2) GENERATED ALWAYS AS (selling_price - cost_price) STORED,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### B. Tabel Induk Shift & Stok Harian (`gasoline.shifts`)

Tabel ini memegang siklus hidup shift per tanggal.

- Saat `status = 'OPEN'`: Kolom `current_jerigen` berfungsi sebagai **Live Stock Jerigen**.
- Saat `status = 'CLOSED'`: Seluruh data terkunci sebagai **Rekapitulasi Shift Final**.

```sql
CREATE TABLE IF NOT EXISTS gasoline.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),

    -- Rekonsiliasi Kas Laci Kasir
    opening_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    closing_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,        -- Uang fisik laci saat closing
    expected_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,       -- opening_cash + total_revenue - cash_out
    cash_variance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,       -- closing_cash - expected_cash

    -- Pengeluaran Kas Operasional dari Laci Kasir
    fuel_purchase_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,  -- Belanja bensin dari laci
    salary_expenses NUMERIC(15, 2) NOT NULL DEFAULT 0.00,     -- Gaji dibayar tunai dari laci
    other_expenses NUMERIC(15, 2) NOT NULL DEFAULT 0.00,      -- Pengeluaran lain dari laci
    cash_out NUMERIC(15, 2) NOT NULL DEFAULT 0.00,            -- Total kas keluar dari laci

    -- Finansial Penjualan Shift
    total_sold_liters NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    total_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_capital NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_net_profit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    -- Inventaris Jerigen Bulk (Realtime saat OPEN, Snapshot saat CLOSED)
    opening_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    purchased_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    poured_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    current_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,    -- Live Stock Jerigen
    closing_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,

    note TEXT,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks B-Tree untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_date ON gasoline.shifts(shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_status ON gasoline.shifts(status);
```

### C. Tabel Rincian Stok Produk Per Shift (`gasoline.shift_product_stocks`)

Tabel ini memegang stok per botol produk (`p1`, `p2`, `p3`) untuk setiap shift.

- Saat `status = 'OPEN'`: Kolom `current_qty` berfungsi sebagai **Live Stock Botol di Rak**.

```sql
CREATE TABLE IF NOT EXISTS gasoline.shift_product_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES gasoline.shifts(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL REFERENCES gasoline.products(id),

    opening_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,  -- Stok fisik botol di rak pagi
    pushed_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,   -- Tambahan botol dituang dari jerigen
    current_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,  -- Live Stock Botol di rak
    closing_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,  -- Stok fisik botol di rak malam
    sold_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,     -- opening_qty + pushed_qty - closing_qty

    unit_selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    unit_cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    capital NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_gasoline_shift_product UNIQUE (shift_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_gasoline_shift_products_shift ON gasoline.shift_product_stocks(shift_id);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_products_prod ON gasoline.shift_product_stocks(product_id);
```

### D. Tabel Penggajian (`gasoline.salary_payments`)

Terkoneksi langsung ke `shift_id` jika dibayar dari laci kasir.

```sql
CREATE TABLE IF NOT EXISTS gasoline.salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    week_label VARCHAR(100),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    recipient VARCHAR(100),
    payment_source VARCHAR(30) NOT NULL DEFAULT 'CASH_DRAWER' CHECK (payment_source IN ('CASH_DRAWER', 'BANK_TRANSFER', 'OWNER_POCKET')),
    shift_id UUID REFERENCES gasoline.shifts(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasoline_salary_date ON gasoline.salary_payments(date DESC);
CREATE INDEX IF NOT EXISTS idx_gasoline_salary_source ON gasoline.salary_payments(payment_source);
CREATE INDEX IF NOT EXISTS idx_gasoline_salary_shift_id ON gasoline.salary_payments(shift_id) WHERE shift_id IS NOT NULL;
```

### E. Tabel Transaksi Shift (`gasoline.shift_transactions`)

Mencatat setiap peristiwa beli bensin (purchase) atau tuang botol (pour) terikat pada shift.

```sql
CREATE TABLE IF NOT EXISTS gasoline.shift_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES gasoline.shifts(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    transaction_date DATE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'pour')),
    target_type VARCHAR(20) NOT NULL DEFAULT 'jerigen' CHECK (target_type IN ('jerigen', 'bottle')),
    product_id VARCHAR(50) REFERENCES gasoline.products(id),
    liters NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    payment_source VARCHAR(30) NOT NULL DEFAULT 'CASH_DRAWER' CHECK (payment_source IN ('CASH_DRAWER', 'BANK_TRANSFER', 'OWNER_POCKET')),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasoline_shift_tx_shift_id ON gasoline.shift_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_tx_date ON gasoline.shift_transactions(shift_date DESC);
```

### F. Buku Kas Terpusat (`gasoline.finances`)

Buku kas utama menautkan seluruh mutasi uang ke `shift_id`, `salary_id`, atau `shift_transaction_id`.

```sql
-- Kolom recap_id di gasoline.finances dialihkan / disesuaikan menjadi shift_id
ALTER TABLE gasoline.finances ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES gasoline.shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gasoline_finances_shift_id ON gasoline.finances(shift_id) WHERE shift_id IS NOT NULL;
```

---

## 3. Strategi Migrasi Data Historis (Data Migration)

1. **Migrasi `gasoline.recaps` ➔ `gasoline.shifts`**:
   - `shift_date` diambil dari `TO_DATE(r.date, 'YYYY-MM-DD')`.
   - `status` diset `'CLOSED'`.
   - `opening_cash` diisi dari `initial_cash_balance` (atau `uang_awal`).
   - `closing_cash` diisi dari `cash_in` (karena data lama menyimpan kas akhir laci di kolom ini).
   - `cash_out` diisi dari `fuel_purchase_cost` (atau `belanja`).
   - `expected_cash` diisi dari `opening_cash + total_revenue - cash_out`.
   - `cash_variance` diisi dari `closing_cash - expected_cash`.
   - `total_sold_liters`, `total_revenue`, `total_capital`, `total_net_profit` dikonversi dari `DOUBLE PRECISION` ke `NUMERIC`.
2. **Migrasi `gasoline.product_recaps` ➔ `gasoline.shift_product_stocks`**:
   - `shift_id` dipetakan dari id baris `gasoline.shifts` yang sesuai tanggalnya.
   - Kolom float dikonversi ke numerik pasti.
3. **Migrasi Shift Aktif Berjalan (`gasoline.active_shift` & `gasoline.live_stock`)**:
   - Jika terdapat baris aktif di `gasoline.active_shift`, buatkan 1 baris di `gasoline.shifts` dengan `status = 'OPEN'`.
   - Isi `current_jerigen` dari nilai `gasoline.live_stock` untuk `__jerigen__`.
   - Isi `current_qty` di `gasoline.shift_product_stocks` dari nilai `gasoline.live_stock` untuk masing-masing produk.
4. **Relasikan `gasoline.salary_payments` & `gasoline.shift_transactions`**:
   - Update `shift_id` pada transaksi shift berdasarkan kecocokan tanggal `shifts.shift_date`.
5. **Drop Tabel Lama yang Usang**:
   - Setelah validasi data selesai: drop `gasoline.active_shift`, drop `gasoline.live_stock`, drop `gasoline.product_recaps`, drop `gasoline.recaps`.

---

## 4. Optimasi Performa Query (Round-trip & Index)

Tambahan 2026-10-27: audit performa query setelah rearsitektur shift selesai.

### A. Ringkasan Temuan

Query SQL di sistem gasoline sudah ringan secara individual:

- Pencarian memakai primary key, unique constraint, atau index.
- Data list sudah dipaginasi (`LIMIT` maksimal 100).
- Item produk per shift diambil sekaligus dengan `WHERE shift_id = ANY($1::uuid[])`, bukan N+1.

Penyebab utama sistem terasa berat adalah **jumlah round-trip ke database per request**, dengan biaya jaringan tinggi per round-trip.

**Bukti dari log development:**

| Observasi                                                             | Nilai   |
| --------------------------------------------------------------------- | ------- |
| Lookup `common.users` by email (unique index, 1 baris)                | 102 ms  |
| `POST /api/recap/sync` (sekitar 15 query berurutan dalam 1 transaksi) | 1843 ms |

Waktu 102 ms untuk query sesederhana itu hampir seluruhnya latensi jaringan, bukan waktu eksekusi Postgres.

---

### B. Prioritas Optimasi

#### P1. Batch Insert pada `syncBatch` (Dampak Terbesar)

- **Lokasi**: `packages/database/src/repositories/GasolineRecapRepository.ts` → `syncBatch`
- **Masalah**: Di dalam loop `for (const item of recap.items)` ada 2 `INSERT` per produk (`product_recaps` dan `shift_product_items`). Ditambah upsert recap, upsert shift, 2 `DELETE`, dan sampai 3 insert `finances`. Dengan 3 produk totalnya sekitar 15 round-trip. Jumlahnya bertambah linear setiap ada produk baru.
- **Solusi**:
  - Ganti insert per produk dengan satu query memakai `unnest`:

    ```sql
    INSERT INTO gasoline.product_recaps (
      recap_id, product_id, opening_stock, closing_stock, sold_qty, revenue, capital, profit
    )
    SELECT $1, * FROM unnest(
      $2::text[], $3::numeric[], $4::numeric[], $5::numeric[],
      $6::numeric[], $7::numeric[], $8::numeric[]
    )
    ```

  - Terapkan pola yang sama untuk `shift_product_items` (termasuk `ON CONFLICT (shift_id, product_id) DO UPDATE`).
  - Gabungkan 3 insert `finances` (`INITIAL_CASH`, `FUEL_PURCHASE`, `SALES_REVENUE`) menjadi satu `INSERT ... VALUES (...), (...), (...)`, dengan baris yang dibangun hanya untuk nilai > 0.

- **Target**: dari ~15 menjadi ~7 query per recap, konstan terhadap jumlah produk.
- **Catatan**: Pertahankan cast eksplisit `::numeric` pada semua parameter. Lihat insiden error `42P08` dan `invalid input syntax for type integer`.

#### P2. Kurangi Query Berlebih per Request

- **Masalah**:
  - Satu aksi UI (contoh: tuang bensin) mengirim 3 request: `/api/stock`, `POST /api/shift/active`, dan `POST /api/shift/transactions`.
  - Setiap request menjalankan `checkAdminAccess`: HTTP call ke Supabase Auth (`getUser`) lalu query `common.users`.
  - `findActiveShift()` menjalankan **3 query berurutan** (shift, items, expenses). Padahal `POST /api/shift/active` dan `POST /api/shift/transactions` hanya butuh id shift aktif.
- **Solusi**:
  - [ ] Tambahkan `findActiveShiftId()` di `GasolineShiftRepository.ts`:

    ```sql
    SELECT id FROM gasoline.shifts WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1
    ```

    Pakai di `app/api/shift/active/route.ts` (POST) dan `app/api/shift/transactions/route.ts` (POST, DELETE).

  - [ ] Di `findActiveShift()`, jalankan query items dan expenses secara paralel dengan `Promise.all` setelah id shift didapat. Pool serverless `max: 3`, jadi paralelisme 2 masih aman.
  - [ ] (Jangka panjang) Konsolidasikan 3 request klien per aksi menjadi 1 endpoint. `recordPour` dan `recordPurchase` sudah memperbarui stok di server, jadi `POST /api/stock` dari klien merupakan duplikasi.

- **Target**: aksi tuang/belanja dari 3 request (masing-masing sekitar 5 sampai 6 round-trip) menjadi 1 request dengan sekitar 4 round-trip.

#### P3. Validasi Region Vercel Function vs Database

- **Masalah**: Database berada di Supabase **Tokyo** (`aws-0-ap-northeast-1`). Repo tidak punya `vercel.json` maupun `preferredRegion`. Kalau tidak diatur, Vercel biasanya menjalankan function di `iad1` (Washington DC), sehingga setiap round-trip menyeberangi Pasifik (sekitar 150 ms).
- **Solusi**:
  - [ ] Cek Vercel Dashboard → Project → Settings → Functions → Region, untuk project production dan staging.
  - [ ] Kalau belum sesuai, set ke Tokyo (`hnd1`), lewat dashboard atau `vercel.json`:

    ```json
    { "regions": ["hnd1"] }
    ```

- **Catatan**: Ini kemungkinan perbaikan termurah dengan dampak terbesar, karena latensi per round-trip dikalikan semua query di P1 dan P2.

#### P4. Index Komposit (Dampak Kecil untuk Volume Data Saat Ini)

Dengan volume data kecil (1 shift per hari), sequential scan tetap cepat. Index berikut disiapkan supaya performa tetap stabil saat data bertambah:

```sql
-- List recap/shift yang sudah tutup (findAllRecaps, findAllShifts, getLatestClosedShift)
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_closed_list
  ON gasoline.shifts (shift_date DESC, shift_number DESC) WHERE status = 'CLOSED';

-- Pencarian shift aktif (findActiveShift)
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_open
  ON gasoline.shifts (opened_at DESC) WHERE status = 'OPEN';

-- List finances sesuai ORDER BY (findAllFinances)
CREATE INDEX IF NOT EXISTS idx_gasoline_finances_date_created
  ON gasoline.finances (transaction_date DESC, created_at DESC);

-- List gaji sesuai ORDER BY (findAllSalaries)
CREATE INDEX IF NOT EXISTS idx_gasoline_salary_date_created
  ON gasoline.salary_payments (date DESC, created_at DESC);
```

- **Catatan**: Index tunggal pada kolom low-cardinality (`shifts(status)`, `finances(flow_type)`, `finances(category)`) jarang dipakai planner. Index tersebut tetap dipertahankan sesuai aturan wajib index di `AGENTS.md`. Evaluasi ulang setelah ada data `pg_stat_user_indexes`.

#### P5. Keamanan: Kredensial Database Hardcoded

- **Lokasi**: `packages/database/src/connection.ts` → `DEFAULT_STAGING_URL`
- **Masalah**: Connection string staging lengkap dengan password ditulis sebagai fallback di source code dan sudah masuk riwayat git.
- **Solusi**:
  - [ ] Rotasi password database staging di Supabase.
  - [x] Hapus `DEFAULT_STAGING_URL`. Wajibkan `DATABASE_URL` / `STAGING_DATABASE_URL` dari environment variable, dan lempar error yang jelas kalau tidak ada.

---

### C. Cara Pengukuran & Validasi

1. **Baseline sebelum perubahan** (dev server lokal ke DB staging, `npm run start:gasoline`):
   - Catat jumlah dan total durasi log `Executed query` (dari `connection.ts`) untuk aksi: buka shift, tuang bensin, belanja, tutup shift (sync recap).
2. **Analisis di database**:
   - Supabase Dashboard → Database → Query Performance (`pg_stat_statements`) untuk query dengan total waktu tertinggi.
   - Jalankan `EXPLAIN (ANALYZE, BUFFERS)` untuk query list (`findAllRecaps`, `findAllFinances`) sebelum dan sesudah index P4.
3. **Setelah perubahan**: ulangi pengukuran langkah 1 di atas dan bandingkan jumlah query serta durasi end-to-end request.

---

## 5. Rencana Tahapan Eksekusi (Roadmap)

### Fase 1: Perancangan Arsitektur & Knowledge Base (Status: Done)

- [x] Dokumentasikan alur transaksi dan perhitungan di `.knowledge/gasoline/business_logic.md`.
- [x] Dokumentasikan arsitektur database-first di `.knowledge/gasoline/system_architecture.md`.
- [x] Dokumentasikan audit data lama dan akar masalah di `.knowledge/gasoline/database_audit.md`.
- [x] Finalisasi desain gabungan `shifts` & `shift_product_stocks` di `.knowledge/plan/optimize_db_plan.md`.

### Fase 2: SQL Migration File (Status: Done)

- [x] Buat migration file `202610250001_gasoline_shifts_rearchitecture.sql` di `packages/database/migrations/`.
- [x] Tulis logika DDL tabel baru (`shifts`, `shift_product_items`, `shift_expenses`, `shift_inventory_logs`).
- [x] Tulis script SQL data migration idempoten dari tabel lama ke tabel baru.
- [x] Tambahkan foreign keys, check constraints, dan B-tree indexes.

### Fase 3: Pembaruan Repository Layer (`@retail/database`) (Status: Done)

- [x] Buat `GasolineShiftRepository.ts` untuk mengelola lifecycle shift (`findActiveShift`, `getLatestClosedShift`, `openShift`, `closeShift`, `recordPurchase`, `recordPour`, `findAllShifts`).
- [x] Perbarui `SalaryPaymentRepository.ts` agar otomatis update `cash_out` dan `salary_expenses` di shift aktif jika dibayar via `CASH_DRAWER`.
- [x] Export `GasolineShiftRepository` di `packages/database/src/index.ts`.

### Fase 4: Integrasi Frontend & API (`apps/gasoline-web`) (Status: Done)

- [x] Integrasikan API endpoints terpadu `/api/shift/active` dan `/api/shift/transactions` dengan `GasolineShiftRepository`.
- [x] Perbarui Zustand `shiftSlice.ts`, `salarySlice.ts`, dan store types agar terhubung dengan shift lifecycle terpadu.
- [x] Tambahkan opsi sumber dana (`payment_source`: Kas Laci Toko, Transfer Bank Toko, Kantong Pemilik) pada form gaji di `salary/page.tsx`.
- [x] Tambahkan field snapshot fisik sisa jerigen saat closing shift di `shift/page.tsx`.
- [x] Tampilkan informasi stok hari ini vs stok kemarin secara otomatis (auto-fill dari `latest_closed_shift`).

### Fase 5: Pengujian & Validasi (Status: Done)

- [x] Jalankan `npm run build:gasoline` dan `npx tsc --noEmit` untuk verifikasi nol error TypeScript (13/13 static pages generated).
- [x] Format kode menggunakan `npx prettier --write .`.
- [x] Verifikasi konsistensi data hitungan kas dan stok jerigen/botol pada database Staging & Production.

### Fase 6: Pembersihan Tabel Usang (Status: Ready for UAT)

- [ ] Jalankan UAT aplikasi retail fuel bersama pengguna / operator toko.
- [ ] Setelah verifikasi operasional stabil, buat dan eksekusi file migrasi `202610250010_drop_deprecated_tables.sql` untuk menghapus tabel usang:
  - `gasoline.active_shift`
  - `gasoline.live_stock`
  - `gasoline.product_recaps`
  - `gasoline.recaps`
  - `gasoline.shift_transactions`

### Fase 7: Baseline & Validasi Region (Status: Planned)

- [ ] Ukur baseline jumlah dan durasi query per aksi (bagian 4.C, langkah 1).
- [ ] Cek dan sesuaikan region Vercel Function (P3).

### Fase 8: Optimasi Repository Layer (Status: Planned)

- [ ] Batch insert `product_recaps`, `shift_product_items`, dan `finances` di `syncBatch` (P1).
- [ ] Tambahkan `findActiveShiftId()` dan paralelkan query di `findActiveShift()` (P2).
- [ ] Jalankan `npx tsc --noEmit` dan `npx prettier --write` pada file yang diubah.

### Fase 9: Index Komposit (Status: Planned)

- [ ] Buat migration file baru di `packages/database/migrations/` untuk index P4.
- [ ] Jalankan di staging, validasi dengan `EXPLAIN ANALYZE`.

### Fase 10: Konsolidasi Request Klien (Status: Backlog)

- [ ] Rancang endpoint tunggal per aksi shift (tuang, belanja) dan hapus `POST /api/stock` duplikat dari `shiftSlice.ts` (P2, jangka panjang).

### Fase 11: Keamanan Kredensial (Status: On Going)

- [x] Hapus fallback hardcoded `DEFAULT_STAGING_URL` di `connection.ts`. Fallback lokal ke staging hanya aktif jika `STAGING_DATABASE_URL` di-set (P5).
- [ ] Pastikan `DATABASE_URL` sudah di-set di environment Vercel production dan staging sebelum deploy.
- [ ] Rotasi password database staging di Supabase, lalu perbarui `STAGING_DATABASE_URL` di `.env`, `.env.staging`, dan Vercel (P5).

### Fase 12: Validasi & Rilis (Status: Planned)

- [ ] Bandingkan hasil pengukuran sebelum dan sesudah.
- [ ] PR ke `staging` untuk UAT, lalu PR `staging` ke `main`.
