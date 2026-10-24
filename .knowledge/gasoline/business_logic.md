# Knowledge Base: Gasoline Web - Business & Transaction Logic

- Document ID: KB-GASOLINE-001
- Created At: 2026-10-25
- Last Updated: 2026-10-25
- Status: Done
- Author: Database Optimization & Architecture Team

---

## 1. Domain Overview & Siklus Operasional Shift

Aplikasi pencatatan operasional retail bensin eceran (SPBU mini / pom bensin mini) dengan siklus harian berbasis Shift Kasir.

### A. Siklus Shift Harian

1. **Shift Pagi (Opening Shift)**:
   - Operator menghitung modal fisik kas di laci kasir (`initial_cash_balance` / `uangAwal`).
   - Operator menghitung stok fisik botol bensin siap jual di rak per varian produk (`opening_stock` untuk `p1`, `p2`, `p3`).
   - Operator mencatat stok awal jerigen bulk (`opening_jerigen_liters`).
   - Data dikunci sebagai baseline shift berjalan.

2. **Aktivitas Berjalan (Intra-Shift Transactions)**:
   - **Pembelian Bensin (Refill / Belanja Minyak)**:
     - Pembelian dari distributor/SPBU besar dalam satuan Liter.
     - Ditampung ke Jerigen Bulk atau langsung dikemas ke Botol.
     - Sumber dana: Kas Laci Kasir (`CASH_DRAWER`) atau Kas Luar/Rekening Pemilik (`EXTERNAL_TRANSFER`).
   - **Pengemasan Bensin (Pouring / Tuang Minyak)**:
     - Pemindahan bensin dari Jerigen Bulk ke Botol siap jual (`p1`, `p2`, `p3`).
     - Mengurangi stok jerigen, menambah stok botol kemasan shift aktif (`pushed_bottles`).
     - Biaya finansial = 0 (perubahan bentuk aset fisik, bukan transaksi kas).
   - **Pembayaran Gaji Karyawan (Salary Payment)**:
     - Pembayaran gaji shift operator atau mingguan.
     - Sumber dana: jika dibayar tunai dari kas laci kasir (`CASH_DRAWER`), kas keluar shift bertambah.

3. **Shift Malam (Closing Shift & Opname)**:
   - Operator menghitung sisa fisik botol di rak (`closing_stock` per produk).
   - Operator menghitung sisa fisik bensin di jerigen (`closing_jerigen_liters`).
   - Operator menghitung uang fisik nyata yang ada di laci kasir (`actual_cash` / `uangAkhir`).
   - Sistem mengkalkulasi penjualan, omset, modal, laba bersih, dan rekonsiliasi kas (selisih fisik vs sistem).
   - Jika terdapat selisih kas, operator wajib mengisi penjelasan (`note`).
   - Shift ditutup, data direkapitulasi secara permanen ke database, active shift di-reset.

---

## 2. Formula Inventaris & Penjualan Produk

### A. Perhitungan Botol Terjual (`sold_qty`)

Untuk setiap produk botol $i$:
$$\text{available\_stock}_i = \text{opening\_stock}_i + \text{pushed\_bottles}_i$$
$$\text{sold\_qty}_i = \max(0, \text{available\_stock}_i - \text{closing\_stock}_i)$$

### B. Perhitungan Finansial Produk

- **Omset Penjualan (Revenue)**:
  $$\text{revenue}_i = \text{sold\_qty}_i \times \text{selling\_price}_i$$
- **Modal Pokok Penjualan (HPP / Capital)**:
  $$\text{capital}_i = \text{sold\_qty}_i \times \text{cost\_price}_i$$
- **Laba Kotor / Bersih Penjualan (Profit)**:
  $$\text{profit}_i = \text{sold\_qty}_i \times (\text{selling\_price}_i - \text{cost\_price}_i)$$
- **Total Liter Terjual**:
  $$\text{total\_sold\_liters} = \sum (\text{sold\_qty}_i \times \text{volume\_liters}_i)$$

### C. Aliran Inventaris Jerigen Bulk

$$\text{calculated\_closing\_jerigen} = \text{opening\_jerigen} + \text{purchased\_jerigen} - \text{poured\_jerigen}$$

- Jika ada selisih antara `actual_closing_jerigen` dengan `calculated_closing_jerigen`, selisih tersebut dihitung sebagai penyusutan / penguapan / penggunaan internal.

---

## 3. Formula Kas Laci & Rekonsiliasi (Cash Reconciliation)

### A. Komponen Kas Laci Shift Aktif

- $\text{Cash In (Kas Masuk Laci)}$:
  $$\text{total\_cash\_in} = \text{initial\_cash\_balance} + \sum \text{revenue}_i$$
- $\text{Cash Out (Kas Keluar Laci)}$:
  $$\text{total\_cash\_out} = \text{drawer\_fuel\_purchases} + \text{drawer\_salary\_payments} + \text{other\_cash\_expenses}$$

### B. Uang Akhir Kasir yang Diharapkan (Expected Cash)

$$\text{expected\_cash} = \text{initial\_cash\_balance} + \text{total\_revenue} - \text{total\_cash\_out}$$

### C. Selisih Kas (Cash Variance)

$$\text{cash\_variance} = \text{actual\_cash} - \text{expected\_cash}$$

- $\text{cash\_variance} = 0$: Kas klop / seimbang.
- $\text{cash\_variance} > 0$: Kas surplus / lebih fisik.
- $\text{cash\_variance} < 0$: Kas minus / kurang fisik.
- Aturan validasi: Jika $\text{cash\_variance} \neq 0$, kolom catatan penutup (`note`) wajib diisi.

---

## 4. Parameter Varian Produk Default

| Product ID | Nama Varian  | Volume (L) | Harga Jual (Rp) | Harga Modal (Rp)  | Margin (Rp) |
| :--------- | :----------- | :--------- | :-------------- | :---------------- | :---------- |
| `p1`       | Premium 1L   | 1.000      | 12.000,00       | 10.000,00         | 2.000,00    |
| `p2`       | Premium 1.2L | 1.200      | 15.000,00       | 12.000,00         | 3.000,00    |
| `p3`       | Premium 1.5L | 1.500      | 20.000,00       | 15.000,00         | 5.000,00    |
| `jerigen`  | Jerigen Bulk | Fleksibel  | N/A             | Sesuai modal beli | N/A         |
