'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInputNumber, formatRupiah, parseRupiah } from '@/lib/CurrencyFormatter'
import {
	ClosingStockFormData,
	OpeningStockFormData,
	PourFormData,
	PurchaseFormData,
	JerigenAdjustmentFormData,
	closingStockSchema,
	openingStockSchema,
	pourSchema,
	purchaseSchema,
	jerigenAdjustmentSchema,
} from '@/lib/schemas/gasoline'
import { useGasolineStore } from '@/store/useGasolineStore'
import { zodResolver } from '@hookform/resolvers/zod'
import {
	AlertCircle,
	ArrowRightLeft,
	Calendar,
	Check,
	DollarSign,
	Edit2,
	Fuel,
	Loader2,
	Moon,
	Receipt,
	ShoppingCart,
	Sliders,
	Sun,
	Trash2,
	TrendingUp,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

export default function ShiftPage() {
	const router = useRouter()
	const {
		products,
		jerigenStock,
		bottleStock,
		latestClosedShift,
		activeOpeningStock,
		activePushedBottles,
		activeDate,
		activeCashIn,
		activeCashOut,
		shiftTransactions,
		setOpeningStock,
		submitPurchase,
		pourFuelToBottles,
		submitClosingStock,
		fetchActiveShift,
		fetchStockFromCloud,
		fetchProductsFromCloud,
		voidShiftTransaction,
		adjustJerigenStockWithReason,
	} = useGasolineStore()

	const [activeTab, setActiveTab] = useState<'shift' | 'purchase' | 'pour' | 'adjust'>('shift')
	const [refillError, setRefillError] = useState<string | null>(null)
	const [pourError, setPourError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isVoidingId, setIsVoidingId] = useState<string | null>(null)
	const [showSuccess, setShowSuccess] = useState(false)

	const today = new Date().toISOString().split('T')[0]

	useEffect(() => {
		fetchActiveShift()
		fetchStockFromCloud()
		fetchProductsFromCloud()
	}, [fetchActiveShift, fetchStockFromCloud, fetchProductsFromCloud])

	// 1. Form Stok Awal (Pagi)
	const {
		register: registerOpen,
		handleSubmit: handleSubmitOpen,
		formState: { errors: errorsOpen },
		reset: resetOpen,
	} = useForm<OpeningStockFormData>({
		resolver: zodResolver(openingStockSchema),
		defaultValues: {
			date: new Date().toISOString().split('T')[0],
			uangAwal: '0',
			openingStocks: products.reduce(
				(acc, p) => {
					acc[p.id] = String(bottleStock[p.id] || 0)
					return acc
				},
				{} as Record<string, string>,
			) as unknown as Record<string, number>,
		} as unknown as OpeningStockFormData,
	})

	useEffect(() => {
		resetOpen({
			date: new Date().toISOString().split('T')[0],
			uangAwal: '0',
			openingStocks: products.reduce(
				(acc, p) => {
					const val = latestClosedShift?.closing_bottles?.[p.id] ?? bottleStock[p.id] ?? 0
					acc[p.id] = String(val)
					return acc
				},
				{} as Record<string, string>,
			) as unknown as Record<string, number>,
		} as unknown as OpeningStockFormData)
	}, [products, bottleStock, latestClosedShift, resetOpen])

	// 2. Form Stok Akhir (Malam)
	const {
		register: registerClose,
		handleSubmit: handleSubmitClose,
		watch: watchClose,
		setValue: setValueClose,
		formState: { errors: errorsClose, dirtyFields: dirtyFieldsClose },
	} = useForm<ClosingStockFormData>({
		resolver: zodResolver(closingStockSchema),
		defaultValues: {
			uangAkhir: '0',
			note: '',
			closingStocks: products.reduce(
				(acc, p) => {
					acc[p.id] = '0'
					return acc
				},
				{} as Record<string, string>,
			) as unknown as Record<string, number>,
		} as unknown as ClosingStockFormData,
	})

	// 3. Form Penyesuaian Stok Jerigen (Opname Fisik Beralasan)
	const {
		register: registerAdjust,
		handleSubmit: handleSubmitAdjust,
		reset: resetAdjust,
		formState: { errors: errorsAdjust },
	} = useForm<JerigenAdjustmentFormData>({
		resolver: zodResolver(jerigenAdjustmentSchema),
		defaultValues: {
			actualLiters: String(jerigenStock || 0),
			reason: '',
		} as unknown as JerigenAdjustmentFormData,
	})

	useEffect(() => {
		resetAdjust({
			actualLiters: String(jerigenStock || 0),
			reason: '',
		} as unknown as JerigenAdjustmentFormData)
	}, [jerigenStock, resetAdjust])

	// 3. Form Pembelian Bensin
	const {
		register: registerPurchase,
		handleSubmit: handleSubmitPurchase,
		reset: resetPurchase,
		watch: watchPurchase,
		setValue: setValuePurchase,
		formState: { errors: errorsPurchase },
	} = useForm<PurchaseFormData>({
		resolver: zodResolver(purchaseSchema),
		defaultValues: {
			liters: '',
			cost: '',
			target: 'jerigen',
			transactionDate: today,
		} as unknown as PurchaseFormData,
	})

	// 4. Form Tuang Bensin
	const {
		register: registerPour,
		handleSubmit: handleSubmitPour,
		reset: resetPour,
		formState: { errors: errorsPour },
	} = useForm<PourFormData>({
		resolver: zodResolver(pourSchema),
		defaultValues: {
			bottleId: products[0]?.id || 'p1',
			quantity: '',
			transactionDate: today,
		} as unknown as PourFormData,
	})

	// Automatic Cost Calculation on Purchase
	const watchedTarget = watchPurchase('target')
	const watchedLiters = watchPurchase('liters')

	useEffect(() => {
		if (watchedTarget) {
			const product =
				watchedTarget === 'jerigen' ? null : products.find(p => p.id === watchedTarget)

			const cleanQtyStr = String(watchedLiters || '').replace(',', '.')
			const qtyNum = parseFloat(cleanQtyStr)

			if (!isNaN(qtyNum)) {
				const costPerUnit = product
					? product.costPrice
					: products[0]
						? Math.round(products[0].costPrice / products[0].volume)
						: 10000
				const totalCost = qtyNum * costPerUnit
				setValuePurchase('cost', formatInputNumber(String(Math.round(totalCost))) as any)
			}
		}
	}, [watchedTarget, watchedLiters, products, setValuePurchase])

	// Closing stock form watchers
	const watchedClosing = watchClose('closingStocks')
	const watchedUangAkhir = watchClose('uangAkhir')

	// Automatic Expected Cash Calculation
	useEffect(() => {
		if (!activeOpeningStock) return
		if (dirtyFieldsClose.uangAkhir) return

		let totalRevenue = 0
		products.forEach(p => {
			const open = activeOpeningStock[p.id] || 0
			const poured = activePushedBottles[p.id] || 0
			const totalInv = open + poured

			const closeInputVal = watchedClosing ? watchedClosing[p.id] : 0
			const closeInput =
				typeof closeInputVal === 'number' ? closeInputVal : parseFloat(String(closeInputVal)) || 0
			const close = isNaN(closeInput) ? 0 : closeInput
			const sold = Math.max(0, totalInv - close)
			totalRevenue += sold * p.sellingPrice
		})

		const expectedCash = activeCashIn + totalRevenue - activeCashOut
		setValueClose('uangAkhir', formatInputNumber(String(expectedCash)) as any)
	}, [
		watchedClosing,
		activeOpeningStock,
		activePushedBottles,
		activeCashIn,
		activeCashOut,
		products,
		setValueClose,
		dirtyFieldsClose.uangAkhir,
	])

	// Render-level Calculations for Preview & Cash Variance
	let computedRevenue = 0
	let computedProfit = 0
	let computedSoldBottles = 0

	if (activeOpeningStock) {
		products.forEach(p => {
			const open = activeOpeningStock[p.id] || 0
			const poured = activePushedBottles[p.id] || 0
			const totalInv = open + poured

			const closeInputVal = watchedClosing ? watchedClosing[p.id] : 0
			const closeInput =
				typeof closeInputVal === 'number' ? closeInputVal : parseFloat(String(closeInputVal)) || 0
			const close = isNaN(closeInput) ? 0 : closeInput
			const sold = Math.max(0, totalInv - close)

			computedSoldBottles += sold
			computedRevenue += sold * p.sellingPrice
			computedProfit += sold * p.margin
		})
	}

	const expectedCash = activeOpeningStock ? activeCashIn + computedRevenue - activeCashOut : 0
	const actualCash = parseRupiah(String(watchedUangAkhir || '0'))
	const cashVariance = actualCash - expectedCash

	const onSubmitOpen = async (data: OpeningStockFormData) => {
		await setOpeningStock(data.date, data.openingStocks, data.uangAwal)
		toast.success('Shift Pagi berhasil dibuka!')
	}

	const onSubmitClose = async (data: ClosingStockFormData) => {
		const actualCashVal = data.uangAkhir
		const variance = actualCashVal - expectedCash
		if (variance !== 0 && !data.note?.trim()) {
			toast.error('Harap isi catatan penjelasan selisih kas sebelum menyimpan laporan.')
			return
		}

		setIsSubmitting(true)
		const res = await submitClosingStock(data.closingStocks, data.uangAkhir, data.note)
		setIsSubmitting(false)

		if (res && !res.success) {
			toast.error(res.message || 'Gagal menyimpan laporan ke server')
			return
		}

		toast.success('Laporan Shift Malam berhasil disimpan!')
	}

	const onSubmitAdjust = async (data: JerigenAdjustmentFormData) => {
		setIsSubmitting(true)
		const res = await adjustJerigenStockWithReason(data.actualLiters, data.reason)
		setIsSubmitting(false)
		if (!res.success) {
			toast.error(res.message || 'Gagal menyesuaikan stok jerigen')
			return
		}
		toast.success('Stok jerigen berhasil disesuaikan dan dicatat ke log audit.')
		setActiveTab('shift')
	}

	const handleVoidTransaction = async (id?: string) => {
		if (!id) return
		setIsVoidingId(id)
		const res = await voidShiftTransaction(id)
		setIsVoidingId(null)
		if (!res.success) {
			toast.error(res.message || 'Gagal membatalkan transaksi')
			return
		}
		toast.success('Transaksi berhasil dibatalkan. Stok dan kas laci dikembalikan.')
	}

	const onSubmitPurchase = (data: PurchaseFormData) => {
		setRefillError(null)
		const txDate = data.transactionDate || activeDate || today
		const res = submitPurchase(data.liters, data.cost, data.target, txDate)
		if (!res.success) {
			setRefillError(res.message || 'Gagal menambahkan pembelian')
			toast.error(res.message || 'Gagal menambahkan pembelian')
		} else {
			toast.success('Pembelian bensin berhasil ditambahkan')
			resetPurchase({
				liters: '',
				cost: '',
				target: 'jerigen',
				transactionDate: activeDate || today,
			} as unknown as PurchaseFormData)
		}
	}

	const onSubmitPour = async (data: PourFormData) => {
		setPourError(null)
		const txDate = data.transactionDate || activeDate || today
		setIsSubmitting(true)
		const res = await pourFuelToBottles(data.bottleId, data.quantity, txDate)
		setIsSubmitting(false)
		if (!res.success) {
			setPourError(res.message || 'Gagal menuangkan bensin')
			toast.error(res.message || 'Gagal menuangkan bensin')
		} else {
			toast.success('Pengemasan botol bensin berhasil')
			resetPour({
				bottleId: products[0]?.id || 'p1',
				quantity: '',
				transactionDate: activeDate || today,
			} as unknown as PourFormData)
		}
	}

	return (
		<div className="flex flex-col gap-4 pb-8">
			{/* Tab Navigation Header (Navigasi Modul Shift) */}
			<div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-200">
				<button
					type="button"
					onClick={() => setActiveTab('shift')}
					className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-bold transition-all ${
						activeTab === 'shift'
							? 'bg-white text-orange-600 shadow-sm'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<Receipt className="w-3.5 h-3.5" />
					<span>Shift</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab('purchase')}
					className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-bold transition-all ${
						activeTab === 'purchase'
							? 'bg-white text-orange-600 shadow-sm'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<ShoppingCart className="w-3.5 h-3.5" />
					<span>Belanja</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab('pour')}
					className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-bold transition-all ${
						activeTab === 'pour'
							? 'bg-white text-orange-600 shadow-sm'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<ArrowRightLeft className="w-3.5 h-3.5" />
					<span>Tuang</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab('adjust')}
					className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-bold transition-all ${
						activeTab === 'adjust'
							? 'bg-white text-orange-600 shadow-sm'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<Sliders className="w-3.5 h-3.5" />
					<span>Koreksi</span>
				</button>
			</div>

			{/* TAB 1: SHIFT KASIR (PAGI / MALAM) */}
			{activeTab === 'shift' && (
				<Card>
					<CardHeader className="pb-3">
						{showSuccess ? (
							<div className="flex flex-col items-center justify-center py-8 text-emerald-600 gap-2">
								<div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center animate-bounce">
									<Check className="w-6 h-6" />
								</div>
								<span className="text-sm font-bold">Laporan Shift Berhasil Disimpan!</span>
							</div>
						) : activeOpeningStock === null ? (
							<div>
								<div className="flex items-center justify-between">
									<CardTitle className="flex items-center gap-1.5 text-slate-900">
										<Sun className="w-4 h-4 text-amber-500" />
										<span>Shift Pagi: Input Stok Awal</span>
									</CardTitle>
									<Badge variant="orange">Pembukaan Shift</Badge>
								</div>
								<CardDescription className="mt-1">
									Catat modal uang awal di laci kasir dan jumlah botol bensin fisik pada pagi hari.
								</CardDescription>
							</div>
						) : (
							<div>
								<div className="flex items-center justify-between">
									<CardTitle className="flex items-center gap-1.5 text-slate-900">
										<Moon className="w-4 h-4 text-indigo-500" />
										<span>Shift Malam: Closing Shift</span>
									</CardTitle>
									<Badge variant="success">Shift Aktif ({activeDate})</Badge>
								</div>
								<CardDescription className="mt-1">
									Masukkan sisa stok botol fisik di akhir hari dan jumlah uang fisik di laci.
								</CardDescription>
							</div>
						)}
					</CardHeader>

					{!showSuccess && (
						<CardContent>
							{activeOpeningStock === null ? (
								/* FORM PAGI */
								<form onSubmit={handleSubmitOpen(onSubmitOpen)} className="flex flex-col gap-4">
									<div className="flex flex-col gap-1.5">
										<label
											htmlFor="date"
											className="text-xs font-bold text-slate-700 flex items-center gap-1"
										>
											<Calendar className="w-3.5 h-3.5 text-slate-400" /> Tanggal Shift
										</label>
										<input
											id="date"
											type="date"
											{...registerOpen('date')}
											className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
										/>
										{errorsOpen.date && (
											<span className="text-[10px] text-red-500 font-semibold">
												{errorsOpen.date.message}
											</span>
										)}
									</div>

									<div className="flex flex-col gap-1.5">
										<label
											htmlFor="uang-awal"
											className="text-xs font-bold text-slate-700 flex items-center gap-1"
										>
											<DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Uang Awal Laci Kasir
											(Rp)
										</label>
										<input
											id="uang-awal"
											type="text"
											inputMode="numeric"
											{...registerOpen('uangAwal', {
												onChange: e => {
													e.target.value = formatInputNumber(e.target.value)
												},
											})}
											className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
											placeholder="Contoh: 100.000"
										/>
										{errorsOpen.uangAwal && (
											<span className="text-[10px] text-red-500 font-semibold">
												{errorsOpen.uangAwal.message}
											</span>
										)}
									</div>

									<div className="flex flex-col gap-1.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
										<div className="flex justify-between items-center">
											<span className="text-xs font-bold text-slate-800 flex items-center gap-1">
												<Fuel className="w-3.5 h-3.5 text-amber-600" /> Stok Bensin Jerigen Awal
											</span>
											<Badge
												variant="outline"
												className="text-xs font-mono font-bold text-amber-900 border-amber-300 bg-white"
											>
												{jerigenStock.toFixed(1)} Liter
											</Badge>
										</div>
										<p className="text-[10px] text-slate-500">
											Otomatis dari sistem (saldo berjalan). Jika fisik berbeda, gunakan menu
											Koreksi.
										</p>
									</div>

									<div className="flex flex-col gap-2.5 pt-2 border-t border-slate-100">
										<div className="flex justify-between items-center">
											<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
												Stok Botol Siap Jual di Rak (Awal Shift)
											</span>
											{latestClosedShift && (
												<span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
													Auto-fill dari shift {latestClosedShift.shift_date}
												</span>
											)}
										</div>
										{products.map(p => (
											<div
												key={p.id}
												className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100"
											>
												<div>
													<span className="text-xs font-bold text-slate-800 block">{p.name}</span>
													<span className="text-[10px] text-slate-400 font-medium">
														Vol: {p.volume}L
													</span>
												</div>
												<div className="w-24">
													<input
														id={`open-${p.id}`}
														type="text"
														inputMode="numeric"
														{...registerOpen(`openingStocks.${p.id}`)}
														className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs font-bold text-center focus:ring-2 focus:ring-orange-500 bg-white"
													/>
												</div>
											</div>
										))}
									</div>

									<Button type="submit" variant="orange" size="lg" className="w-full mt-2">
										Simpan Stok & Buka Shift Pagi
									</Button>
								</form>
							) : (
								/* FORM MALAM */
								<div className="flex flex-col gap-4">
									{/* Info Ringkas Shift Terkunci */}
									<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
										<div className="flex justify-between items-center pb-2 border-b border-slate-200">
											<span className="text-xs font-bold text-slate-800">
												Stok Awal Shift Terkunci
											</span>
											<button
												type="button"
												onClick={() => useGasolineStore.setState({ activeOpeningStock: null })}
												className="inline-flex items-center gap-1 text-[10px] text-orange-600 font-bold bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded transition-colors"
											>
												<Edit2 className="w-3 h-3" /> Ubah Pagi
											</button>
										</div>
										<div className="flex justify-between text-xs text-slate-600">
											<span>Uang Awal Kasir:</span>
											<span className="font-bold text-slate-900">{formatRupiah(activeCashIn)}</span>
										</div>
										<div className="flex justify-between text-xs text-slate-600">
											<span>Stok Jerigen Saat Ini:</span>
											<span className="font-bold text-amber-700">
												{jerigenStock.toFixed(1)} Liter
											</span>
										</div>
										<div className="grid grid-cols-3 gap-1 pt-1">
											{products.map(p => (
												<div
													key={p.id}
													className="bg-white p-1.5 rounded border border-slate-100 text-center"
												>
													<span className="text-[9px] text-slate-400 font-bold block">
														{p.name}
													</span>
													<span className="text-xs font-extrabold text-slate-800">
														{activeOpeningStock[p.id] || 0} Botol
													</span>
												</div>
											))}
										</div>
									</div>

									{/* Riwayat Transaksi Shift Berjalan & Tombol Batalkan (Void) */}
									<div className="flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
										<div className="flex justify-between items-center">
											<span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
												<Receipt className="w-3.5 h-3.5 text-orange-500" />
												Riwayat Transaksi Shift Ini ({shiftTransactions?.length || 0})
											</span>
											<span className="text-[10px] text-slate-400">Batalkan jika salah catat</span>
										</div>

										{!shiftTransactions || shiftTransactions.length === 0 ? (
											<div className="py-3 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
												Belum ada transaksi belanja atau tuang di shift ini.
											</div>
										) : (
											<div className="flex flex-col gap-1.5 divide-y divide-slate-100 max-h-56 overflow-y-auto">
												{shiftTransactions.map(tx => {
													const isPurchase = tx.type === 'purchase'
													const targetProduct = tx.product_id
														? products.find(p => p.id === tx.product_id)
														: null
													const title = isPurchase
														? `Belanja Bensin ${targetProduct ? targetProduct.name : 'ke Jerigen'}`
														: `Tuang ke ${targetProduct ? targetProduct.name : 'Botol'}`
													const detail = isPurchase
														? `${tx.liters ?? 0} L • ${formatRupiah(tx.cost || 0)}`
														: `${tx.quantity ?? 0} Botol (${((tx.quantity ?? 0) * (targetProduct?.volume ?? 1)).toFixed(1)} L)`

													return (
														<div
															key={tx.id || `${tx.type}-${tx.transaction_date}`}
															className="pt-2 first:pt-0 flex justify-between items-center text-xs"
														>
															<div className="flex flex-col">
																<div className="flex items-center gap-1.5">
																	<span
																		className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
																			isPurchase
																				? 'bg-rose-50 text-rose-700 border border-rose-200'
																				: 'bg-blue-50 text-blue-700 border border-blue-200'
																		}`}
																	>
																		{isPurchase ? 'BELANJA' : 'TUANG'}
																	</span>
																	<span className="font-semibold text-slate-800">{title}</span>
																</div>
																<span className="text-[10px] text-slate-500 font-medium">
																	{detail}
																</span>
															</div>

															{tx.id && (
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	disabled={isVoidingId === tx.id}
																	onClick={() => handleVoidTransaction(tx.id)}
																	className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
																	title="Batalkan transaksi ini"
																>
																	{isVoidingId === tx.id ? (
																		<Loader2 className="w-3.5 h-3.5 animate-spin" />
																	) : (
																		<Trash2 className="w-3.5 h-3.5" />
																	)}
																	<span className="text-[10px] ml-1 font-bold">Batal</span>
																</Button>
															)}
														</div>
													)
												})}
											</div>
										)}
									</div>

									<form onSubmit={handleSubmitClose(onSubmitClose)} className="flex flex-col gap-4">
										<div className="flex flex-col gap-2.5">
											<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
												Input Sisa Botol di Rak (Akhir Shift)
											</span>
											{products.map(p => (
												<div
													key={p.id}
													className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100"
												>
													<div>
														<span className="text-xs font-bold text-slate-800 block">{p.name}</span>
														<span className="text-[10px] text-slate-400 font-medium">
															Awal {activeOpeningStock[p.id] || 0} + Tuang{' '}
															{activePushedBottles[p.id] || 0}
														</span>
													</div>
													<div className="w-24">
														<input
															id={`close-${p.id}`}
															type="text"
															inputMode="numeric"
															{...registerClose(`closingStocks.${p.id}`)}
															className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs font-bold text-center focus:ring-2 focus:ring-orange-500 bg-white"
														/>
													</div>
												</div>
											))}
										</div>

										{/* Input Uang Akhir Aktual */}
										<div className="flex flex-col gap-1.5 pt-2">
											<div className="flex justify-between items-center">
												<label htmlFor="uang-akhir" className="text-xs font-bold text-slate-700">
													Uang Akhir Aktual (Fisik di Laci)
												</label>
												<Badge variant="outline" className="text-[9px] text-slate-500 font-mono">
													Hitungan Sistem: {formatRupiah(expectedCash)}
												</Badge>
											</div>
											<input
												id="uang-akhir"
												type="text"
												inputMode="numeric"
												{...registerClose('uangAkhir', {
													onChange: e => {
														e.target.value = formatInputNumber(e.target.value)
													},
												})}
												className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500"
												placeholder="Contoh: 350.000"
											/>
											{errorsClose.uangAkhir && (
												<span className="text-[10px] text-red-500 font-semibold">
													{errorsClose.uangAkhir.message}
												</span>
											)}
										</div>

										{/* PREVIEW HASIL PENJUALAN HARI INI (OPTIMIZED CARD) */}
										<Card className="bg-slate-900 text-white border-slate-800 shadow-md">
											<CardHeader className="pb-2">
												<div className="flex items-center justify-between">
													<CardTitle className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
														<TrendingUp className="w-4 h-4" /> Preview Hasil Penjualan Hari Ini
													</CardTitle>
													<Badge variant="orange">{computedSoldBottles} Botol Terjual</Badge>
												</div>
											</CardHeader>
											<CardContent className="flex flex-col gap-3">
												<div className="flex flex-col gap-2 divide-y divide-slate-800">
													{products.map(p => {
														const open = activeOpeningStock[p.id] || 0
														const poured = activePushedBottles[p.id] || 0
														const totalInv = open + poured

														const closeInputVal = watchedClosing ? watchedClosing[p.id] : 0
														const closeInput =
															typeof closeInputVal === 'number'
																? closeInputVal
																: parseFloat(String(closeInputVal)) || 0
														const close = isNaN(closeInput) ? 0 : closeInput
														const sold = Math.max(0, totalInv - close)
														const revenue = sold * p.sellingPrice

														return (
															<div
																key={p.id}
																className="pt-2 first:pt-0 flex justify-between items-center text-xs"
															>
																<div>
																	<span className="font-bold text-slate-800 block">{p.name}</span>
																	<span className="text-[10px] text-slate-600">
																		(Stok {open} + Masuk {poured} = {totalInv} unit)
																	</span>
																</div>
																<div className="text-right">
																	<span className="font-extrabold text-orange-400 block">
																		{sold} Botol
																	</span>
																	<span className="text-[10px] text-slate-600 font-mono">
																		{formatRupiah(revenue)}
																	</span>
																</div>
															</div>
														)
													})}
												</div>

												{/* Summary Totals */}
												<div className="pt-3 border-t border-slate-800 flex flex-col gap-1.5 text-xs">
													<div className="flex justify-between text-slate-800">
														<span>Total Omset Penjualan:</span>
														<span className="font-bold text-emerald-400">
															{formatRupiah(computedRevenue)}
														</span>
													</div>
													<div className="flex justify-between text-slate-800">
														<span>Perkiraan Keuntungan Bersih:</span>
														<span className="font-bold text-emerald-400">
															{formatRupiah(computedProfit)}
														</span>
													</div>
													<div className="flex justify-between text-slate-800">
														<span>Total Belanja Kas (Shift Ini):</span>
														<span className="font-bold text-rose-400">
															-{formatRupiah(activeCashOut)}
														</span>
													</div>
													<div className="flex justify-between text-slate-800 pt-1 border-t border-slate-800 font-bold">
														<span>Uang Teoretis di Laci:</span>
														<span className="text-slate-800 font-mono">
															{formatRupiah(expectedCash)}
														</span>
													</div>
													<div className="flex justify-between items-center pt-1">
														<span className="text-slate-800 font-medium">Status Selisih Kas:</span>
														<span
															className={`font-bold ${
																cashVariance === 0
																	? 'text-slate-500'
																	: cashVariance > 0
																		? 'text-emerald-400'
																		: 'text-rose-400'
															}`}
														>
															{cashVariance === 0
																? 'Seimbang (Balance)'
																: `${cashVariance > 0 ? '+' : ''}${formatRupiah(cashVariance)}`}
														</span>
													</div>
												</div>
											</CardContent>
										</Card>

										{/* Catatan Selisih (jika ada selisih) */}
										{cashVariance !== 0 && (
											<div className="flex flex-col gap-1.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
												<label
													htmlFor="closing-note"
													className="text-xs font-bold text-rose-800 flex items-center gap-1"
												>
													<AlertCircle className="w-3.5 h-3.5" /> Catatan Penjelasan Selisih Kas *
												</label>
												<textarea
													id="closing-note"
													rows={2}
													{...registerClose('note')}
													className="w-full px-3 py-2 border border-rose-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-orange-500"
													placeholder="Tuliskan alasan selisih kas (misal: sisa kembalian, titipan kasir, dsb)."
												/>
											</div>
										)}

										<Button
											type="submit"
											variant="orange"
											size="lg"
											disabled={isSubmitting}
											className="w-full mt-2"
										>
											{isSubmitting ? (
												<>
													<Loader2 className="w-4 h-4 animate-spin mr-2" />
													<span>Menyimpan Laporan...</span>
												</>
											) : (
												'Simpan Laporan Akhir (Tutup Shift)'
											)}
										</Button>
									</form>
								</div>
							)}
						</CardContent>
					)}
				</Card>
			)}

			{/* TAB 2: BELANJA BENSIN */}
			{activeTab === 'purchase' && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-slate-900">
							<ShoppingCart className="w-4 h-4 text-orange-500" />
							<span>Catat Pembelian Bensin</span>
						</CardTitle>
						<CardDescription>
							Catat pengeluaran uang laci untuk membeli bensin dari distributor.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{refillError && (
							<div className="p-3 mb-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
								<AlertCircle className="w-4 h-4 flex-shrink-0" />
								<span>{refillError}</span>
							</div>
						)}

						<form onSubmit={handleSubmitPurchase(onSubmitPurchase)} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label htmlFor="purchase-date" className="text-xs font-bold text-slate-700">
									Tanggal Transaksi
								</label>
								<input
									id="purchase-date"
									type="date"
									{...registerPurchase('transactionDate')}
									className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<label htmlFor="purchase-target" className="text-xs font-bold text-slate-700">
									Tujuan Alokasi Bensin
								</label>
								<select
									id="purchase-target"
									{...registerPurchase('target')}
									className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-orange-500"
								>
									<option value="jerigen">Masuk ke Jerigen Bulk (Penyimpanan)</option>
									{products.map(p => (
										<option key={p.id} value={p.id}>
											Langsung Isikan ke {p.name} ({p.volume}L)
										</option>
									))}
								</select>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="flex flex-col gap-1.5">
									<label htmlFor="purchase-liters" className="text-xs font-bold text-slate-700">
										Jumlah ({watchedTarget === 'jerigen' ? 'Liter' : 'Botol'})
									</label>
									<input
										id="purchase-liters"
										type="text"
										inputMode="numeric"
										{...registerPurchase('liters')}
										className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500"
										placeholder={watchedTarget === 'jerigen' ? 'Contoh: 20' : 'Contoh: 10'}
									/>
									{errorsPurchase.liters && (
										<span className="text-[10px] text-red-500 font-semibold">
											{errorsPurchase.liters.message}
										</span>
									)}
								</div>

								<div className="flex flex-col gap-1.5">
									<label htmlFor="purchase-cost" className="text-xs font-bold text-slate-700">
										Uang Keluar (Rp)
									</label>
									<input
										id="purchase-cost"
										type="text"
										inputMode="numeric"
										{...registerPurchase('cost', {
											onChange: e => {
												e.target.value = formatInputNumber(e.target.value)
											},
										})}
										className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500"
										placeholder="Contoh: 200.000"
									/>
									{errorsPurchase.cost && (
										<span className="text-[10px] text-red-500 font-semibold">
											{errorsPurchase.cost.message}
										</span>
									)}
								</div>
							</div>

							<Button type="submit" variant="orange" size="lg" className="w-full mt-2">
								Simpan Pembelian Bensin
							</Button>
						</form>
					</CardContent>
				</Card>
			)}

			{/* TAB 3: TUANG BOTOL */}
			{activeTab === 'pour' && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-slate-900">
							<ArrowRightLeft className="w-4 h-4 text-orange-500" />
							<span>Tuang Bensin ke Botol</span>
						</CardTitle>
						<CardDescription>
							Memindahkan stok bensin curah dari Jerigen ke kemasan botol siap jual (tanpa
							pengeluaran kas).
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex justify-between items-center">
							<span className="text-xs font-bold text-slate-700">Stok Jerigen Tersedia:</span>
							<Badge variant="orange" className="text-xs font-extrabold font-mono">
								{jerigenStock.toFixed(1)} Liter
							</Badge>
						</div>

						{pourError && (
							<div className="p-3 mb-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
								<AlertCircle className="w-4 h-4 flex-shrink-0" />
								<span>{pourError}</span>
							</div>
						)}

						<form onSubmit={handleSubmitPour(onSubmitPour)} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label htmlFor="pour-date" className="text-xs font-bold text-slate-700">
									Tanggal Transaksi
								</label>
								<input
									id="pour-date"
									type="date"
									{...registerPour('transactionDate')}
									className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="flex flex-col gap-1.5">
									<label htmlFor="pour-bottle" className="text-xs font-bold text-slate-700">
										Pilih Tipe Botol
									</label>
									<select
										id="pour-bottle"
										{...registerPour('bottleId')}
										className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-orange-500"
									>
										{products.map(p => (
											<option key={p.id} value={p.id}>
												{p.name} ({p.volume}L)
											</option>
										))}
									</select>
								</div>

								<div className="flex flex-col gap-1.5">
									<label htmlFor="pour-qty" className="text-xs font-bold text-slate-700">
										Jumlah Botol
									</label>
									<input
										id="pour-qty"
										type="text"
										inputMode="numeric"
										{...registerPour('quantity')}
										className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500"
										placeholder="Contoh: 10"
									/>
									{errorsPour.quantity && (
										<span className="text-[10px] text-red-500 font-semibold">
											{errorsPour.quantity.message}
										</span>
									)}
								</div>
							</div>

							<Button
								type="submit"
								variant="orange"
								size="lg"
								className="w-full mt-2"
								disabled={isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									'Proses Pengemasan Botol'
								)}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}

			{/* TAB 4: KOREKSI / PENYESUAIAN STOK JERIGEN */}
			{activeTab === 'adjust' && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-slate-900">
							<Sliders className="w-4 h-4 text-orange-500" />
							<span>Penyesuaian Stok Jerigen (Opname Fisik)</span>
						</CardTitle>
						<CardDescription>
							Sesuaikan angka stok jerigen sistem jika terjadi selisih dengan fisik asli. Setiap
							penyesuaian wajib menyertakan alasan dan akan tercatat permanen dalam log audit.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex justify-between items-center">
							<span className="text-xs font-bold text-slate-700">
								Stok Jerigen Sistem Saat Ini:
							</span>
							<Badge variant="orange" className="text-xs font-extrabold font-mono">
								{jerigenStock.toFixed(1)} Liter
							</Badge>
						</div>

						<form onSubmit={handleSubmitAdjust(onSubmitAdjust)} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label htmlFor="adjust-liters" className="text-xs font-bold text-slate-700">
									Stok Fisik Sebenarnya di Jerigen (Liter, Maks 50L) *
								</label>
								<input
									id="adjust-liters"
									type="text"
									inputMode="decimal"
									{...registerAdjust('actualLiters')}
									className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500"
									placeholder={`Contoh: ${jerigenStock.toFixed(1)}`}
								/>
								{errorsAdjust.actualLiters && (
									<span className="text-[10px] text-red-500 font-semibold">
										{errorsAdjust.actualLiters.message}
									</span>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<label htmlFor="adjust-reason" className="text-xs font-bold text-slate-700">
									Alasan Koreksi / Penyesuaian Stok *
								</label>
								<textarea
									id="adjust-reason"
									rows={3}
									{...registerAdjust('reason')}
									className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-orange-500"
									placeholder="Contoh: Penguapan bensin, tumpah saat penuangan, atau salah catat belanja."
								/>
								{errorsAdjust.reason && (
									<span className="text-[10px] text-red-500 font-semibold">
										{errorsAdjust.reason.message}
									</span>
								)}
							</div>

							<Button
								type="submit"
								variant="orange"
								size="lg"
								disabled={isSubmitting}
								className="w-full mt-2"
							>
								{isSubmitting ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span>Menyimpan Koreksi...</span>
									</>
								) : (
									'Simpan & Catat Audit Log'
								)}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
