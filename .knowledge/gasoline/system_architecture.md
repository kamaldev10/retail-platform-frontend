# Knowledge Base: Gasoline Web - System Architecture & Data Flow

- Document ID: KB-GASOLINE-002
- Created At: 2026-10-25
- Last Updated: 2026-10-25
- Status: Done
- Author: Database Optimization & Architecture Team

---

## 1. Arsitektur Monorepo & Prinsip Database-First

Aplikasi `gasoline-web` menggunakan Next.js 15 (App Router) dalam monorepo npm workspaces.

### A. Prinsip Single Source of Truth

- PostgreSQL adalah satu-satunya sumber kebenaran (Single Source of Truth).
- Dilarang menyimpan status bisnis di `localStorage` atau `sessionStorage`.
- Dilarang menggunakan middleware Zustand `persist`.
- Seluruh mutasi data harus melakukan HTTP `POST`/`PUT`/`DELETE` ke API Route sebelum atau bersamaan dengan pembaruan state di memori.
- Saat komponen memuat (`mount`), data diambil dari API Route (`fetchRecapsFromCloud`, `fetchSalaryFromCloud`, `fetchActiveShift`).

### B. Struktur Paket Monorepo

- `apps/gasoline-web`: Frontend PWA Next.js 15 App Router.
- `packages/database`: Lapisan akses data terpusat (DAO/Repository pattern via `pg` connection pool).
- `packages/types`: Definisi kontrak TypeScript bersama.

---

## 2. Pemetaan State Management (Zustand Slices)

State frontend diatur modular menggunakan Zustand Slice Pattern:

| Slice          | Tanggung Jawab State                         | Aksi / API Terkait                                                |
| :------------- | :------------------------------------------- | :---------------------------------------------------------------- |
| `catalogSlice` | Master produk, stok botol & jerigen live     | `/api/products`, `/api/stock`                                     |
| `shiftSlice`   | Shift aktif, opening/closing, purchase, pour | `/api/shift/active`, `/api/shift/transactions`, `/api/recap/sync` |
| `recapSlice`   | Riwayat rekap shift harian                   | `/api/recap`, `/api/recap/sync`                                   |
| `salarySlice`  | Riwayat & pencatatan gaji karyawan           | `/api/salary`                                                     |
| `financeSlice` | Buku besar keuangan terpusat                 | `/api/finance`                                                    |

---

## 3. Spesifikasi Kontrak API & Standar Respons

Seluruh API koleksi (GET list) wajib mengimplementasikan pagination dan limit:

- Query parameters: `page` (default `1`), `limit` (default `20`, max `100`).
- Format respons terstandar:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Daftar Endpoints Utama:

1. `GET /api/recap` & `POST /api/recap/sync`
2. `GET /api/shift/active`, `POST /api/shift/active`, `DELETE /api/shift/active`
3. `GET /api/shift/transactions`, `POST /api/shift/transactions`
4. `GET /api/salary`, `POST /api/salary`
5. `GET /api/stock`, `POST /api/stock`
6. `GET /api/finance`
