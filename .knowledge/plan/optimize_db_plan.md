# Rencana Optimasi & Migrasi Database: Gasoline Web

- Document ID: PLAN-DB-OPT-001
- Created At: 2026-10-25
- Last Updated: 2026-10-25
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

## 4. Rencana Tahapan Eksekusi (Roadmap)

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

### Fase 4: Integrasi Frontend & API (`apps/gasoline-web`) (Status: On Going)

- [ ] Buat API endpoints terpadu `/api/shift` (GET active, POST open/close, POST purchase/pour/expense).
- [ ] Perbarui Zustand `shiftSlice.ts` dan `catalogSlice.ts` membaca dari endpoint shift terpadu.
- [ ] Tambahkan opsi sumber dana (`payment_source`) pada form gaji di `salary/page.tsx`.
- [ ] Tambahkan field snapshot sisa jerigen saat closing shift di `shift/page.tsx`.
- [ ] Tampilkan informasi stok hari ini vs stok kemarin secara otomatis.

### Fase 5: Pengujian & Validasi (Status: Todo)

- [ ] Jalankan `npx tsc --noEmit` untuk verifikasi nol error TypeScript.
- [ ] Verifikasi konsistensi data hitungan kas dan stok jerigen/botol.
