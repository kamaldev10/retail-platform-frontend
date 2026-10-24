# Knowledge Base: Gasoline Web - Database Audit & Data Analysis

- Document ID: KB-GASOLINE-003
- Created At: 2026-10-25
- Last Updated: 2026-10-25
- Status: Done
- Author: Database Optimization & Architecture Team

---

## 1. Evaluasi Pemisahan Skema Database

Struktur skema saat ini di PostgreSQL terbagi menjadi 3:

1. `common`: Akun pengguna, otentikasi, log sistem global.
2. `gasoline`: Siklus shift retail bahan bakar minyak eceran, inventaris botol & jerigen, kasir, penggajian.
3. `pos`: Point of Sale retail umum / toko kelontong (orders, order_items, produk ritel barcode).

### Penilaian:

- Pemisahan 3 skema ini **SUDAH TEPAT** secara arsitektur monorepo & Domain-Driven Design (Bounded Context terpisah).
- Masalah utama bukan pada pemisahan skema, melainkan pada **definisi tipe data, integritas relasi tabel, dan logika mapping di dalam skema `gasoline`**.

---

## 2. Audit Temuan Data Lapangan (`temp/`) & Akar Masalah

### A. Masalah Presisi Angka (Floating-Point Drift)

- **Kondisi**: Tabel `gasoline.recaps`, `gasoline.product_recaps`, `gasoline.products`, `gasoline.shift_transactions`, `gasoline.salary_payments` menggunakan tipe `DOUBLE PRECISION`.
- **Bukti di `temp/recaps_rows.sql`**:
  - Row id `9ef5eb86-9f92-4731-baac-9f155d09782c`:
    - `total_revenue = 282166.666666667`
    - `total_net_profit = 50166.6666666667`
- **Dampak**: Ketidaktepatan desimal mata uang dan pembulatan mengacaukan perhitungan selisih kas laci kasir.
- **Rekomendasi**: Konversi seluruh kolom mata uang ke `NUMERIC(15, 2)` dan kuantitas liter ke `NUMERIC(12, 3)`.

---

### B. Masalah Pembelian Bensin ke Jerigen Tidak Tercatat / Meleset

- **Kondisi Saat Ini**:
  1. `gasoline.recaps` dan `gasoline.product_recaps` hanya menyimpan varian botol (`p1`, `p2`, `p3`). Tidak ada kolom snapshot stok jerigen harian (opening jerigen, purchased jerigen, poured jerigen, closing jerigen).
  2. Stok jerigen hanya disimpan pada tabel overwrite `gasoline.live_stock` (hanya baris terakhir) dan JSONB `active_shift` yang dihapus saat closing shift.
  3. Di `temp/shift_transactions_rows.sql`:
     - Pembelian jerigen diinput dengan `product_id = null`.
     - Ditemukan baris id `fe61b7b4-b707-43cf-8eaa-803552ef48b7` dengan `shift_date = ''` (string kosong). Ini terjadi jika operator menekan beli bensin saat shift belum aktif/terbuka. Transaksi menjadi orphan dan tidak pernah masuk ke rekap shift manapun.
  4. Mismatch waktu pengeluaran kas vs realisasi penjualan:
     - Pembelian jerigen mengeluarkan uang laci pada hari H (`activeCashOut` bengkak).
     - Bensin jerigen baru dituang dan terjual berhari-hari kemudian.
     - Rekap harian hari H menjadi minus besar, sedangkan hari-hari berikutnya laba semu karena bensin tuang tidak dibebani modal beli hari itu.

---

### C. Masalah Pembayaran Gaji: Uang Kas Laci Tidak Berkurang

- **Kondisi Saat Ini**:
  1. Fungsi `salaryPaymentRepository.createSalary` hanya melakukan `INSERT` ke `gasoline.salary_payments` dan `gasoline.finances`.
  2. Tidak ada operasi yang memotong atau memperbarui `gasoline.active_shift.cash_out`.
  3. Form `apps/gasoline-web/src/app/salary/page.tsx` tidak memiliki pilihan sumber dana kas (apakah dari laci kasir `CASH_DRAWER` atau transfer bank pemilik).
  4. Perhitungan kas akhir laci yang diharapkan di halaman shift adalah:
     $$\text{expectedCash} = \text{activeCashIn} + \text{totalRevenue} - \text{activeCashOut}$$
     Karena pembayaran gaji tidak menambah `activeCashOut`, sistem mengira uang gaji masih ada di laci.
  5. Bukti riil catatan operator di `temp/recaps_rows.sql`:
     - Row `fa176ea2...`: `"Harusnya 400.000 dah potong dri gaji (makanya selisih 402.000)"`
     - Row `9ba93797...`: `"400 keluar, gaji. Gatau nih kenapa"`
     - Row `ce66d9b5...`: `"Penggajian"` (selisih kas minus Rp 596.000)

---

### D. Perancuan Kolom Finansial di `gasoline.recaps`

- Di kode `shiftSlice.ts` dan `GasolineRecapRepository.ts`:
  - Kolom `cash_in` pada tabel `gasoline.recaps` diisi nilai `uangAkhir` (uang fisik laci saat closing).
  - Kolom `cash_out` diisi nilai `uangAwal + belanja`.
  - Kolom `net_finance_flow` diisi `cash_in - cash_out` (ini sebenarnya selisih fisik kas vs buku kas, bukan arus kas riil).
- Kondisi ini membingungkan pelaporan finansial dan harus dipisahkan secara tegas antara **Arus Kas Bersih (Cash Flow)** dengan **Selisih Kas Laci Kasir (Cash Variance)**.
