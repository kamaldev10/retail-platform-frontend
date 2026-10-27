import { z } from 'zod'
import { parseRupiah } from '@/lib/CurrencyFormatter'

export const salaryPaymentSchema = z.object({
	date: z.string().min(1, 'Tanggal wajib diisi'),
	weekLabel: z.string().optional(),
	amount: z
		.string()
		.transform(val => parseRupiah(val))
		.refine(val => val > 0, { message: 'Nominal gaji harus lebih besar dari 0' }),
	recipient: z.string().optional(),
	paymentSource: z
		.enum(['CASH_DRAWER', 'EXTERNAL_TRANSFER', 'OWNER_POCKET'])
		.default('CASH_DRAWER'),
	note: z.string().optional(),
})

export type SalaryPaymentFormData = z.infer<typeof salaryPaymentSchema>
