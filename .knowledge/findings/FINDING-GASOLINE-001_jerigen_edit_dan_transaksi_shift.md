# FINDING-GASOLINE-001: Edit Stok Jerigen Tanpa Jejak Audit & Kebutuhan Pembatalan Transaksi Shift

- **Dokumen ID**: `FINDING-GASOLINE-001`
- **Tanggal Ditemukan**: 2026-10-25
- **Terakhir Diperbarui**: 2026-10-25
- **Status**: `Done`
- **Tingkat Urgensi**: Tinggi (Critical for Audit & Data Integrity)
- **Modul Terdampak**: `apps/gasoline-web` (Dashboard, Shift), `@retail/database` (`GasolineShiftRepository`)

---

## 1. Latar Belakang & Deskripsi Masalah

### 1.1 Edit Stok Jerigen Bebas di Halaman Utama (No Audit Trail)

Pada antarmuka Halaman Utama (`apps/gasoline-web/src/app/page.tsx`), terdapat tombol **"Edit"** pada kartu _Stok Tangki Cadangan (Jerigen)_. Fitur ini memungkinkan pengguna langsung mengubah angka liter jerigen (0–50L) dan mengirimkan `POST /api/stock` yang langsung menimpa baris `gasoline.live_stock` (`__jerigen__`).

**Kelemahan & Risiko:**

1. **Tidak Ada Jejak Audit (No Audit Trail)**: Tidak ada pencatatan waktu, alasan perubahan, selisih fisik, maupun pengguna yang mengubah.
2. **Desinkronisasi Shift Aktif**: Jika shift sedang berjalan (`status = 'OPEN'`), mengedit angka jerigen secara bebas di halaman utama membuat data `gasoline.shifts.current_jerigen` dan log inventaris `gasoline.shift_inventory_logs` menjadi tidak sinkron.
3. **Selisih Gaib saat Shift Tutup**: Rekonsiliasi shift malam menghitung formula teoretis jerigen (`Awal + Belanja - Tuang`). Jika angka diubah di tengah jalan tanpa transaksi resmi, sistem mendeteksi selisih jerigen yang tidak dapat dijelaskan asalnya.

---

### 1.2 Ketiadaan Fitur Pembatalan Transaksi Salah (Human Error)

Dalam operasional harian kasir bensin eceran, kesalahan input kasir merupakan hal yang lumrah:

- **Salah Catat Belanja Bensin**: Kasir mengetik belanja bensin bulk 30 Liter (Rp 300.000) padahal yang dibeli sebenarnya hanya 20 Liter (Rp 200.000).
- **Salah Catat Tuang Botol**: Kasir mencatat menuang 10 botol 1 Liter padahal baru menuang 5 botol.

**Kondisi Saat Ini:**

- Kasir tidak memiliki mekanisme untuk mengedit atau membatalkan (void/revert) transaksi yang salah tersebut pada antarmuka Halaman Shift.
- Akibatnya, kasir terpaksa "mengakali" dengan cara mengedit paksa stok jerigen di halaman utama atau menutupi selisih di catatan closing malam, yang mengakibatkan uang kas laci (`activeCashOut`) dan stok barang menjadi selisih.

---

## 2. Analisis Dampak (Impact Analysis)

| Aspek                     | Dampak Jika Dibiarkan                                                                                                                                 |
| :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kas Laci Toko**         | Uang belanja bensin yang salah catat tetap memotong `cash_out` laci kasir, menyebabkan false negative/positive variance pada uang fisik closing laci. |
| **Stok Jerigen & Botol**  | Volume jerigen dan botol rak tidak sinkron antara fisik dan sistem.                                                                                   |
| **Audit & Akuntabilitas** | Pemilik toko tidak dapat membedakan antara bensin tumpah/menguap, kesalahan kasir, atau indikasi kecurangan (fraud).                                  |

---

## 3. Solusi Terpilih (Approved Solution)

Berdasarkan kesepakatan, solusi dibagi menjadi 3 pilar:

### Pilar 1: Pembatalan / Revert Transaksi di Halaman Shift (Void Transaction)

1. Menampilkan daftar **Riwayat Transaksi Shift Berjalan** (Belanja Bensin & Tuang Botol) pada Halaman Shift.
2. Menyediakan tombol **Batalkan / Hapus Transaksi** untuk transaksi shift berjalan:
   - **Jika Pembelian Dibatalkan**:
     - Kembalikan uang kas laci (`activeCashOut` berkurang sebesar nominal belanja yang dibatalkan).
     - Kurangi stok bensin yang sebelumnya masuk (stok jerigen atau stok botol rak berkurang kembali).
     - Hapus baris pengeluaran kas di `gasoline.shift_expenses` dan log di `gasoline.shift_inventory_logs`.
   - **Jika Penuangan Botol Dibatalkan**:
     - Kembalikan stok bensin ke jerigen (`+ volume liter`).
     - Kurangi stok botol siap jual di rak (`- jumlah botol`).
     - Hapus log di `gasoline.shift_inventory_logs`.

### Pilar 2: Penyesuaian Stok Jerigen Resmi Beralasan (Stock Adjustment Opname)

1. **Menghilangkan tombol edit bebas tanpa jejak** di Halaman Utama.
2. Menggantinya dengan fitur **"Koreksi / Penyesuaian Stok Jerigen"** (dapat diakses dari Shift atau dialog berizin):
   - Input wajib: `Stok Fisik Baru (Liter)` dan `Alasan / Keterangan Penyesuaian` _(Contoh: "Bensin tumpah 0.5L saat penuangan", "Koreksi hasil ukur fisik", "Penguapan tangki")_.
   - Sistem mencatat selisihnya ke `gasoline.shift_inventory_logs` dengan `action_type = 'ADJUSTMENT'`.
   - Memperbarui `current_jerigen` pada shift aktif secara transparan.

### Pilar 3: Otomasi Penuh Stok Jerigen pada Pembukaan & Penutupan Shift

1. **Shift Pagi (Buka)**: Stok awal jerigen **100% otomatis** diambil dari sistem (`jerigenStock` dari cloud DB). Kasir hanya perlu menghitung uang modal laci kasir (`uangAwal`) dan botol fisik rak (`openingStocks`).
2. **Shift Malam (Tutup)**: Sisa jerigen otomatis dihitung sistem menggunakan formula:
   $$\text{Sisa Jerigen} = \text{Stok Awal} + \text{Total Belanja} - \text{Total Tuang} \pm \text{Total Koreksi}$$
   Kasir tidak perlu input manual sisa jerigen saat closing, kecuali jika ada penyesuaian tumpah yang telah dicatat lewat form penyesuaian beralasan.

---

## 4. Rencana Implementasi Teknis (Action Plan)

1. **Repository Layer (`@retail/database`)**:
   - Tambahkan method `voidTransaction(shiftId: string, transactionId: string)` pada `GasolineShiftRepository`.
   - Tambahkan method `adjustJerigenStock(shiftId: string, actualLiters: number, reason: string)` pada `GasolineShiftRepository`.
2. **API Routes (`apps/gasoline-web`)**:
   - Endpoint `DELETE /api/shift/transactions`: menerima ID transaksi dan melakukan revert atomik via transaksi database.
   - Endpoint `POST /api/shift/adjustment`: menerima penyesuaian stok jerigen dengan parameter alasan.
3. **Zustand Store (`shiftSlice.ts` & `catalogSlice.ts`)**:
   - Tambahkan action `voidShiftTransaction(id)` yang merefresh transaksi, kas laci, dan stok live.
   - Tambahkan action `adjustJerigen(actualLiters, reason)`.
4. **Antarmuka Pengguna (UI)**:
   - `shift/page.tsx`:
     - Tampilkan kartu riwayat transaksi shift berjalan dengan tombol konfirmasi pembatalan.
     - Hapus input manual jerigen di Form Pagi dan Form Malam (jadikan otomatis dari sistem).
     - Sediakan tombol modal "Penyesuaian Stok Jerigen".
   - `page.tsx` (Dashboard):
     - Ganti tombol edit bebas jerigen menjadi tombol pintas ke riwayat/penyesuaian shift.
