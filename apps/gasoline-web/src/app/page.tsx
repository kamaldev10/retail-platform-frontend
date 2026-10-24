'use client'

import { formatFloatComma, formatRupiah } from '@/lib/CurrencyFormatter'
import { useGasolineStore } from '@/store/useGasolineStore'
import {
	ArrowUpRight,
	FileText,
	Fuel,
	HelpCircle,
	Inbox,
	Landmark,
	Loader2,
	Package,
	RefreshCw,
	ShoppingCart,
	TrendingUp,
	Users,
	Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const getIndonesianDayName = (dateStr: string) => {
	try {
		const date = new Date(dateStr)
		const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
		return dayNames[date.getDay()]
	} catch {
		return '-'
	}
}

const formatShortCash = (val: number) => {
	if (val === 0) return '0'
	const absVal = Math.abs(val)
	const thousands = absVal / 1000
	const formatted = thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(1)}k`
	return val < 0 ? `-${formatted}` : formatted
}

const getStockVal = (
	recap: { items?: Array<{ productId: string; closingStock: number; soldQty: number }> },
	prodId: string,
	field: 'closingStock' | 'soldQty',
) => {
	const item = recap.items?.find(i => i.productId === prodId)
	return item ? item[field] : 0
}

export default function DashboardPage() {
	const {
		products,
		dailyRecaps,
		jerigenStock,
		bottleStock,
		activeOpeningStock,
		activePushedBottles,
		clearAllRecaps,
		fetchRecapsFromCloud,
		fetchStockFromCloud,
		fetchProductsFromCloud,
		fetchActiveShift,
	} = useGasolineStore()

	const [isLoadingData, setIsLoadingData] = useState(true)

	useEffect(() => {
		const loadDashboardData = async () => {
			setIsLoadingData(true)
			await Promise.all([
				fetchRecapsFromCloud(),
				fetchStockFromCloud(),
				fetchProductsFromCloud(),
				fetchActiveShift(),
			])
			setIsLoadingData(false)
		}
		loadDashboardData()
	}, [fetchRecapsFromCloud, fetchStockFromCloud, fetchProductsFromCloud, fetchActiveShift])

	const getLiveBottleQty = (productId: string) => {
		if (activeOpeningStock !== null) {
			const opening = activeOpeningStock[productId] || 0
			const pushed = activePushedBottles[productId] || 0
			return opening + pushed
		}
		return bottleStock[productId] || 0
	}

	const totalRevenue = dailyRecaps.reduce((acc, curr) => acc + curr.totalRevenue, 0)
	const totalProfit = dailyRecaps.reduce((acc, curr) => acc + curr.totalNetProfit, 0)
	const dateNow = new Date().toLocaleDateString('id-ID')

	return (
		<div className="flex flex-col gap-4">
			{/* Fitur Shortcut (2 Baris Grid) */}
			<section className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
				<div className="flex items-center justify-between mb-2.5">
					<h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
						<Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Akses Cepat
					</h3>
				</div>

				<div className="grid grid-cols-4 gap-2">
					{/* Baris 1 */}
					<Link
						href="/shift"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<ShoppingCart className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Tutup Shift</span>
					</Link>

					<Link
						href="/shift"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<Fuel className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Tuang Botol</span>
					</Link>

					<Link
						href="/catalog"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<Inbox className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Stok Jerigen</span>
					</Link>

					<Link
						href="/salary"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<Users className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Input Gaji</span>
					</Link>

					{/* Baris 2 */}
					<Link
						href="/finance"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<Landmark className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Catat Kas</span>
					</Link>

					<Link
						href="/report"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<FileText className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Lihat Rekap</span>
					</Link>

					<Link
						href="/catalog"
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<Package className="w-4 h-4" />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">
							Katalog Produk
						</span>
					</Link>

					<button
						type="button"
						onClick={async () => {
							setIsLoadingData(true)
							await Promise.all([fetchRecapsFromCloud(), fetchStockFromCloud(), fetchActiveShift()])
							setIsLoadingData(false)
							toast.success('Data stok & shift berhasil disinkronkan dari database.')
						}}
						className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-orange-50/60 border border-slate-200/80 hover:border-orange-200 transition-all text-center group active:scale-95"
					>
						<div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
							<RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
						</div>
						<span className="text-[10px] font-bold text-slate-800 leading-tight">Refresh Data</span>
					</button>
				</div>
			</section>

			<section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-1.5">
						<Inbox className="w-3.5 h-3.5 text-orange-500" />
						<h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
							Stok Botol Siap Jual
						</h3>
					</div>
					<div className="flex items-center gap-1.5">
						{activeOpeningStock !== null ? (
							<span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
								Shift Aktif
							</span>
						) : (
							<span className="text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
								PostgreSQL Live
							</span>
						)}
					</div>
				</div>

				<div className="grid grid-cols-3 gap-3">
					{products.map(p => {
						const readyQty = getLiveBottleQty(p.id)
						return (
							<div
								key={p.id}
								className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center flex flex-col justify-between shadow-2xs"
							>
								<span className="text-[10px] text-slate-500 font-bold block leading-tight truncate">
									{p.name}
								</span>
								{isLoadingData ? (
									<div className="py-2 flex items-center justify-center">
										<Loader2 className="w-4 h-4 animate-spin text-orange-500" />
									</div>
								) : (
									<span className="text-xl font-black text-slate-900 block mt-1 font-mono">
										{readyQty}
									</span>
								)}
								<span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Botol</span>
							</div>
						)
					})}
				</div>
			</section>

			<section className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm">
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
						Stok Tangki Cadangan (Jerigen)
					</h3>
					<Link
						href="/shift"
						className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-md transition-colors"
						aria-label="Kelola stok jerigen di shift"
					>
						Kelola di Shift <ArrowUpRight className="w-3 h-3" />
					</Link>
				</div>

				<div className="flex items-center justify-between mb-1">
					<span className="text-2xl font-black text-gray-900">{jerigenStock.toFixed(1)} L</span>
					<span className="text-xs text-gray-400 font-semibold">Kapasitas Maks: 50.0 L</span>
				</div>

				<div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
					<div
						className="bg-orange-500 h-full rounded-full transition-all duration-500"
						style={{
							width: `${Math.min(100, (jerigenStock / 50) * 100)}%`,
						}}
					/>
				</div>
			</section>

			<section className="grid grid-cols-2 gap-3">
				<div className="bg-white p-3 rounded-xl border border-gray-150 shadow-sm flex flex-col justify-between">
					<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						Total Pendapatan (Omset)
					</span>
					<div className="mt-2">
						<span className="text-base font-extrabold text-gray-900 block truncate">
							{formatRupiah(totalRevenue)}
						</span>
						<span className="text-[9px] text-green-600 font-bold flex items-center gap-0.5 mt-0.5">
							<ArrowUpRight className="w-2.5 h-2.5" /> Penjualan kotor
						</span>
					</div>
				</div>

				<div className="bg-white p-3 rounded-xl border border-gray-150 shadow-sm flex flex-col justify-between">
					<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						Keuntungan Bersih (Profit)
					</span>
					<div className="mt-2">
						<span className="text-base font-extrabold text-green-600 block truncate">
							{formatRupiah(totalProfit)}
						</span>
						<span className="text-[9px] text-green-600 font-bold flex items-center gap-0.5 mt-0.5">
							<TrendingUp className="w-2.5 h-2.5" /> Margin langsung
						</span>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-2 mt-1">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
						Riwayat Rekap Harian
					</h2>
					{dailyRecaps.length > 0 && (
						<button
							type="button"
							onClick={clearAllRecaps}
							className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded transition-colors"
						>
							Reset Data
						</button>
					)}
				</div>

				{dailyRecaps.length === 0 ? (
					<div className="bg-white p-8 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center gap-3">
						<div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center">
							<HelpCircle className="w-6 h-6" />
						</div>
						<div>
							<p className="text-sm font-bold text-gray-700">Belum ada rekap yang tercatat</p>
							<p className="text-xs text-gray-400 mt-0.5 px-4">
								Ketuk tab Shift untuk memasukkan perhitungan fisik stok dan mencatat riwayat
								transaksi.
							</p>
						</div>
					</div>
				) : (
					<div className="w-full overflow-x-auto rounded-xl border border-gray-150 shadow-sm bg-white">
						<table className="w-full text-left border-collapse text-[10px]">
							<thead>
								<tr className="bg-slate-50 border-b border-gray-150 text-gray-500 font-bold uppercase tracking-wider">
									<th className="py-2 px-2.5">Hari</th>
									<th className="py-2 px-2.5">Tgl</th>
									<th className="py-2 px-2 text-center">Sisa (P1/P2/P3)</th>
									<th className="py-2 px-2 text-center">Laku (P1/P2/P3)</th>
									<th className="py-2 px-2 text-right">Uang Awal</th>
									<th className="py-2 px-2 text-right">Uang Akhir</th>
									<th className="py-2 px-2 text-right">Sistem</th>
									<th className="py-2 px-2.5 text-right">Selisih</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
								{dailyRecaps.map(recap => {
									const dayName = getIndonesianDayName(recap.date)
									const displayDate = recap.date.split('-').slice(1).join('/')

									const sisaP1 = getStockVal(recap, 'p1', 'closingStock')
									const sisaP2 = getStockVal(recap, 'p2', 'closingStock')
									const sisaP3 = getStockVal(recap, 'p3', 'closingStock')

									const lakuP1 = getStockVal(recap, 'p1', 'soldQty')
									const lakuP2 = getStockVal(recap, 'p2', 'soldQty')
									const lakuP3 = getStockVal(recap, 'p3', 'soldQty')

									const uangAwal = recap.uangAwal || 0
									const belanja = recap.belanja || 0
									const omset = recap.totalRevenue
									const expectedCash = uangAwal + omset - belanja
									const actualCash = recap.cashSummary.cashIn
									const variance = actualCash - expectedCash

									return (
										<tr key={recap.id} className="hover:bg-slate-50 transition-colors">
											<td className="py-2.5 px-2.5 font-bold text-gray-900">{dayName}</td>
											<td className="py-2.5 px-2.5 whitespace-nowrap text-gray-500">
												{displayDate}
											</td>
											<td className="py-2.5 px-2 text-center whitespace-nowrap font-mono text-gray-600">
												{formatFloatComma(sisaP1, 2)} / {formatFloatComma(sisaP2, 2)} /{' '}
												{formatFloatComma(sisaP3, 2)}
											</td>
											<td className="py-2.5 px-2 text-center whitespace-nowrap font-mono text-orange-600 font-bold">
												{formatFloatComma(lakuP1, 2)} / {formatFloatComma(lakuP2, 2)} /{' '}
												{formatFloatComma(lakuP3, 2)}
											</td>
											<td className="py-2.5 px-2 text-right whitespace-nowrap font-mono">
												{formatShortCash(uangAwal)}
											</td>
											<td className="py-2.5 px-2 text-right whitespace-nowrap font-mono text-slate-900 font-bold">
												{formatShortCash(actualCash)}
											</td>
											<td className="py-2.5 px-2 text-right whitespace-nowrap font-mono text-slate-500">
												{formatShortCash(expectedCash)}
											</td>
											<td className="py-2.5 px-2.5 text-right whitespace-nowrap font-mono">
												{variance === 0 ? (
													<span className="text-gray-400">-</span>
												) : variance > 0 ? (
													<span className="text-green-600 font-bold">
														+{formatShortCash(variance)}
													</span>
												) : (
													<span className="text-red-500 font-bold">
														{formatShortCash(variance)}
													</span>
												)}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	)
}
