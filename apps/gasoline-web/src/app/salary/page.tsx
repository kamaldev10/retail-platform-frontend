'use client'

import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { salaryPaymentSchema, SalaryPaymentFormData } from '@/lib/schemas/salary'
import { useGasolineStore } from '@/store/useGasolineStore'
import { formatRupiah, formatInputNumber } from '@/lib/CurrencyFormatter'
import {
	Users,
	PlusCircle,
	CheckCircle,
	AlertCircle,
	Calendar,
	Wallet,
	UserCheck,
	FileText,
} from 'lucide-react'
import { Pagination } from '@/components/common/Pagination'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function SalaryPage() {
	const { salaryPayments, salaryPagination, addSalaryPayment, fetchSalaryFromCloud } =
		useGasolineStore()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
		null,
	)

	useEffect(() => {
		fetchSalaryFromCloud()
	}, [fetchSalaryFromCloud])

	const today = new Date().toISOString().split('T')[0]

	const {
		register,
		handleSubmit,
		setValue,
		reset,
		formState: { errors },
	} = useForm<SalaryPaymentFormData>({
		resolver: zodResolver(salaryPaymentSchema),
		defaultValues: {
			date: today,
			weekLabel: '',
			amount: 0,
			recipient: '',
			paymentSource: 'CASH_DRAWER',
			note: '',
		},
	})

	const onSubmit = async (data: SalaryPaymentFormData) => {
		setIsSubmitting(true)
		setFeedback(null)

		const result = await addSalaryPayment({
			date: data.date,
			weekLabel: data.weekLabel || undefined,
			amount: data.amount,
			recipient: data.recipient || undefined,
			paymentSource: data.paymentSource,
			note: data.note || undefined,
		})

		setIsSubmitting(false)

		if (result.success) {
			const msg = result.message || 'Pembayaran gaji berhasil dicatat'
			toast.success(msg)
			setFeedback({
				type: 'success',
				message: msg,
			})
			reset({
				date: today,
				weekLabel: '',
				amount: 0,
				recipient: '',
				paymentSource: 'CASH_DRAWER',
				note: '',
			})
		} else {
			const msg = result.message || 'Gagal menyimpan data gaji'
			toast.error(msg)
			setFeedback({
				type: 'error',
				message: msg,
			})
		}
	}

	const totalSalaryPaid = salaryPayments.reduce((acc, curr) => acc + curr.amount, 0)

	return (
		<div className="flex flex-col gap-4 pb-20">
			{/* Header Overview Card */}
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-1.5 text-slate-900">
							<Users className="w-4 h-4 text-orange-500" />
							<span>Pengelolaan Gaji Karyawan</span>
						</CardTitle>
						<Badge variant="orange">{salaryPayments.length} Pembayaran</Badge>
					</div>
					<CardDescription>
						Pencatatan transaksi penggajian operator dan pengeluaran kasir harian.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between p-3.5 rounded-xl bg-orange-50/60 border border-orange-100">
						<div className="flex items-center gap-2">
							<Wallet className="w-4 h-4 text-orange-600" />
							<span className="text-xs font-semibold text-orange-950">Total Gaji Terbayar</span>
						</div>
						<span className="text-sm font-extrabold text-orange-700 font-mono">
							{formatRupiah(totalSalaryPaid)}
						</span>
					</div>
				</CardContent>
			</Card>

			{/* Form Input Card */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
						<PlusCircle className="w-4 h-4 text-orange-500" /> Catat Pembayaran Gaji Baru
					</CardTitle>
				</CardHeader>
				<CardContent>
					{feedback && (
						<div
							className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 mb-3 ${
								feedback.type === 'success'
									? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
									: 'bg-rose-50 text-rose-700 border border-rose-200'
							}`}
						>
							{feedback.type === 'success' ? (
								<CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
							) : (
								<AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
							)}
							<span>{feedback.message}</span>
						</div>
					)}

					<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
						<div className="flex flex-col gap-1">
							<label
								htmlFor="salary-date"
								className="text-xs font-bold text-slate-700 flex items-center gap-1"
							>
								<Calendar className="w-3.5 h-3.5 text-slate-400" /> Tanggal Pembayaran
							</label>
							<input
								id="salary-date"
								type="date"
								{...register('date')}
								aria-invalid={!!errors.date}
								aria-describedby={errors.date ? 'salary-date-error' : undefined}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
							/>
							{errors.date && (
								<span id="salary-date-error" className="text-[10px] text-red-500 font-semibold">
									{errors.date.message}
								</span>
							)}
						</div>

						<div className="flex flex-col gap-1">
							<label
								htmlFor="salary-week"
								className="text-xs font-bold text-slate-700 flex items-center gap-1"
							>
								<FileText className="w-3.5 h-3.5 text-slate-400" /> Keterangan Minggu (Opsional)
							</label>
							<input
								id="salary-week"
								type="text"
								placeholder="Contoh: Minggu ke-4 Juli 2026"
								{...register('weekLabel')}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
							/>
						</div>

						<div className="flex flex-col gap-1">
							<label
								htmlFor="salary-amount"
								className="text-xs font-bold text-slate-700 flex items-center gap-1"
							>
								<Wallet className="w-3.5 h-3.5 text-emerald-500" /> Nominal Gaji (Rp)
							</label>
							<input
								id="salary-amount"
								type="text"
								placeholder="0"
								onChange={e => {
									const raw = e.target.value
									const formatted = formatInputNumber(raw)
									e.target.value = formatted
									setValue('amount', formatted as any)
								}}
								aria-invalid={!!errors.amount}
								aria-describedby={errors.amount ? 'salary-amount-error' : undefined}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-orange-500"
							/>
							{errors.amount && (
								<span id="salary-amount-error" className="text-[10px] text-red-500 font-semibold">
									{errors.amount.message}
								</span>
							)}
						</div>

						<div className="flex flex-col gap-1">
							<label
								htmlFor="salary-recipient"
								className="text-xs font-bold text-slate-700 flex items-center gap-1"
							>
								<UserCheck className="w-3.5 h-3.5 text-slate-400" /> Penerima Gaji (Opsional)
							</label>
							<input
								id="salary-recipient"
								type="text"
								placeholder="Nama karyawan / Staff shift"
								{...register('recipient')}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
							/>
						</div>

						<div className="flex flex-col gap-1">
							<label
								htmlFor="salary-source"
								className="text-xs font-bold text-slate-700 flex items-center gap-1"
							>
								<Wallet className="w-3.5 h-3.5 text-slate-400" /> Sumber Kas Pengeluaran
							</label>
							<select
								id="salary-source"
								{...register('paymentSource')}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500 bg-white"
							>
								<option value="CASH_DRAWER">Kas Laci Kasir (Potong Kas Shift Berjalan)</option>
								<option value="EXTERNAL_TRANSFER">
									Transfer Bank Pemilik (Tidak Potong Kasir)
								</option>
								<option value="OWNER_POCKET">Uang Pribadi Pemilik (Tidak Potong Kasir)</option>
							</select>
						</div>

						<div className="flex flex-col gap-1">
							<label htmlFor="salary-note" className="text-xs font-bold text-slate-700">
								Catatan Penjelasan (Opsional)
							</label>
							<input
								id="salary-note"
								type="text"
								placeholder="Catatan tambahan..."
								{...register('note')}
								className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-orange-500"
							/>
						</div>

						<Button
							type="submit"
							variant="orange"
							size="lg"
							disabled={isSubmitting}
							className="w-full mt-1"
						>
							{isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran Gaji'}
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* History List */}
			<section className="flex flex-col gap-2.5">
				<span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
					Riwayat Pembayaran Gaji
				</span>

				{salaryPayments.length === 0 ? (
					<Card className="border-dashed border-slate-200">
						<CardContent className="py-8 text-center text-xs text-slate-400 font-medium">
							Belum ada catatan pembayaran gaji karyawan.
						</CardContent>
					</Card>
				) : (
					<div className="flex flex-col gap-2">
						{salaryPayments.map(item => (
							<Card key={item.id} className="p-3.5 flex flex-col gap-2 shadow-sm">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-xs font-bold text-slate-900">
										<Calendar className="w-3.5 h-3.5 text-orange-500" />
										<span>{item.date}</span>
										{item.weekLabel && <Badge variant="orange">{item.weekLabel}</Badge>}
									</div>
									<span className="text-xs font-extrabold text-rose-600 font-mono">
										-{formatRupiah(item.amount)}
									</span>
								</div>

								{(item.recipient || item.note) && (
									<div className="text-[11px] text-slate-600 flex flex-col gap-1 pt-2 border-t border-slate-100">
										{item.recipient && (
											<div className="flex items-center gap-1">
												<span className="font-semibold text-slate-400">Penerima:</span>
												<span className="font-bold text-slate-800">{item.recipient}</span>
											</div>
										)}
										{item.note && (
											<div className="flex items-center gap-1 text-slate-500 italic">
												<span>{item.note}</span>
											</div>
										)}
									</div>
								)}
							</Card>
						))}
					</div>
				)}

				<Pagination
					pagination={salaryPagination}
					onPageChange={p => fetchSalaryFromCloud(p, salaryPagination.limit)}
					onLimitChange={l => fetchSalaryFromCloud(1, l)}
					className="mt-2"
				/>
			</section>
		</div>
	)
}
