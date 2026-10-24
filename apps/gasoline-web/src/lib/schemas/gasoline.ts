import { z } from 'zod'
import { parseRupiah } from '@/lib/CurrencyFormatter'

export const openingStockSchema = z.object({
	date: z.string().min(1, 'Tanggal wajib diisi'),
	uangAwal: z
		.string()
		.transform(val => parseRupiah(val))
		.refine(val => val >= 0, { message: 'Uang awal tidak boleh negatif' }),
	openingStocks: z.record(
		z.string(),
		z
			.string()
			.transform(val => parseFloat(val) || 0)
			.refine(val => val >= 0, { message: 'Stok tidak boleh negatif' }),
	),
})

export type OpeningStockFormData = z.infer<typeof openingStockSchema>

export const closingStockSchema = z.object({
	uangAkhir: z
		.string()
		.transform(val => parseRupiah(val))
		.refine(val => val >= 0, { message: 'Uang akhir tidak boleh negatif' }),
	note: z.string().optional(),
	closingStocks: z.record(
		z.string(),
		z
			.string()
			.transform(val => parseFloat(val) || 0)
			.refine(val => val >= 0, { message: 'Stok tidak boleh negatif' }),
	),
})

export type ClosingStockFormData = z.infer<typeof closingStockSchema>

export const jerigenAdjustmentSchema = z.object({
	actualLiters: z
		.string()
		.transform(val => parseFloat(val.replace(',', '.')) || 0)
		.refine(val => val >= 0 && val <= 50, {
			message: 'Stok jerigen harus antara 0 sampai 50 Liter',
		}),
	reason: z.string().min(3, 'Alasan penyesuaian wajib diisi (minimal 3 karakter)'),
})

export type JerigenAdjustmentFormData = z.infer<typeof jerigenAdjustmentSchema>

export const purchaseSchema = z.object({
	liters: z
		.string()
		.transform(val => parseFloat(val) || 0)
		.refine(val => val > 0, { message: 'Jumlah botol/unit harus lebih besar dari 0' }),
	cost: z
		.string()
		.transform(val => parseRupiah(val))
		.refine(val => val > 0, { message: 'Biaya harus lebih besar dari 0' }),
	target: z.string().min(1, 'Target alokasi wajib diisi'),
	transactionDate: z
		.string()
		.optional()
		.default(() => new Date().toISOString().split('T')[0]),
})

export type PurchaseFormData = z.infer<typeof purchaseSchema>

export const pourSchema = z.object({
	bottleId: z.string().min(1, 'Botol wajib dipilih'),
	quantity: z
		.string()
		.transform(val => parseFloat(val) || 0)
		.refine(val => val > 0, { message: 'Jumlah botol harus lebih besar dari 0' }),
	transactionDate: z
		.string()
		.optional()
		.default(() => new Date().toISOString().split('T')[0]),
})

export type PourFormData = z.infer<typeof pourSchema>

export const loginSchema = z.object({
	email: z.string().email('Format email tidak valid').min(1, 'Email wajib diisi'),
	password: z.string().min(6, 'Password minimal 6 karakter'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const dailyReportSchema = z.object({
	date: z.string().min(1, 'Tanggal wajib diisi'),
	uangAwal: z
		.string()
		.transform(val => parseFloat(val) || 0)
		.refine(val => val >= 0, { message: 'Uang awal tidak boleh negatif' }),
	openingStocks: z.record(
		z.string(),
		z
			.string()
			.transform(val => parseFloat(val) || 0)
			.refine(val => val >= 0, { message: 'Stok tidak boleh negatif' }),
	),
	uangAkhir: z
		.string()
		.transform(val => parseFloat(val) || 0)
		.refine(val => val >= 0, { message: 'Uang total/akhir tidak boleh negatif' }),
	note: z.string().optional(),
	closingStocks: z.record(
		z.string(),
		z
			.string()
			.transform(val => parseFloat(val) || 0)
			.refine(val => val >= 0, { message: 'Stok tidak boleh negatif' }),
	),
})

export type DailyReportFormData = z.infer<typeof dailyReportSchema>
