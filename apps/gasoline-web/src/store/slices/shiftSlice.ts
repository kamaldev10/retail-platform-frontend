import { StateCreator } from 'zustand'
import { DailyRecapInput, PRODUCTS, calculateDailyRecap } from '../../lib/calculations'
import { ShiftSliceState, ShiftSliceActions, GasolineStore } from '../types'

export type ShiftSlice = ShiftSliceState & ShiftSliceActions

export const createShiftSlice: StateCreator<GasolineStore, [], [], ShiftSlice> = (set, get) => ({
	activeDate: '',
	activeOpeningStock: null,
	activePushedBottles: {
		p1: 0,
		p2: 0,
		p3: 0,
	},
	activeCashIn: 0,
	activeCashOut: 0,
	shiftTransactions: [],
	latestClosedShift: null,

	setOpeningStock: async (date, stocks, uangAwal, openingJerigen) => {
		const targetJerigen = openingJerigen !== undefined ? openingJerigen : get().jerigenStock
		set({
			activeDate: date,
			activeOpeningStock: stocks,
			bottleStock: { ...stocks },
			jerigenStock: targetJerigen,
			activePushedBottles: Object.keys(stocks).reduce(
				(acc, key) => {
					acc[key] = 0
					return acc
				},
				{} as Record<string, number>,
			),
			activeCashIn: uangAwal,
			activeCashOut: 0,
		})
		const updatedState = get()
		fetch('/api/stock', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jerigen: updatedState.jerigenStock,
				bottles: updatedState.bottleStock,
			}),
		}).catch(() => {})
		await fetch('/api/shift/active', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				active_date: date,
				cash_in: uangAwal,
				cash_out: 0,
				opening_stocks: stocks,
				opening_jerigen: targetJerigen,
				pushed_bottles: Object.keys(stocks).reduce(
					(acc, key) => {
						acc[key] = 0
						return acc
					},
					{} as Record<string, number>,
				),
			}),
		})
	},

	submitPurchase: (quantity, cost, target, transactionDate) => {
		const state = get()

		if (target === 'jerigen') {
			// Jerigen: 1 unit = 1 Liter
			const addedLiters = quantity
			const newStock = state.jerigenStock + addedLiters
			if (newStock > 50) {
				return {
					success: false,
					message: `Gagal: Kapasitas Jerigen tidak boleh melebihi 50L (Maks sisa kapasitas: ${(50 - state.jerigenStock).toFixed(1)}L)`,
				}
			}
			set({
				jerigenStock: newStock,
				activeCashOut: state.activeCashOut + cost,
			})
		} else {
			const product = state.products.find(p => p.id === target)
			if (!product) return { success: false, message: 'Produk tidak valid' }

			// Direct bottle quantity input
			const newUnits = quantity
			const updatedPushed = { ...state.activePushedBottles }
			updatedPushed[target] = (updatedPushed[target] || 0) + newUnits

			set({
				bottleStock: {
					...state.bottleStock,
					[target]: (state.bottleStock[target] || 0) + newUnits,
				},
				activePushedBottles: updatedPushed,
				activeCashOut: state.activeCashOut + cost,
			})
		}

		const updatedState = get()
		const targetProduct = state.products.find(p => p.id === target)
		const calculatedLiters =
			target === 'jerigen' ? quantity : quantity * (targetProduct?.volume || 1)

		fetch('/api/stock', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jerigen: updatedState.jerigenStock,
				bottles: updatedState.bottleStock,
			}),
		}).catch(() => {})

		fetch('/api/shift/active', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				active_date: updatedState.activeDate,
				cash_in: updatedState.activeCashIn,
				cash_out: updatedState.activeCashOut,
				opening_stocks: updatedState.activeOpeningStock || {},
				pushed_bottles: updatedState.activePushedBottles,
			}),
		}).catch(() => {})

		fetch('/api/shift/transactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				shift_date: updatedState.activeDate,
				transaction_date: transactionDate || new Date().toISOString().split('T')[0],
				type: 'purchase',
				product_id: target === 'jerigen' ? null : target,
				liters: calculatedLiters,
				quantity,
				cost,
			}),
		})
			.then(async r => {
				if (r.ok) {
					const newTx = await r.json()
					set(s => ({ shiftTransactions: [...s.shiftTransactions, newTx] }))
				}
			})
			.catch(() => {})

		return { success: true }
	},

	pourFuelToBottles: (bottleId, quantity, transactionDate) => {
		const state = get()
		const product = state.products.find(p => p.id === bottleId)
		if (!product) return { success: false, message: 'Produk tidak valid' }

		const requiredLiters = quantity * product.volume
		if (state.jerigenStock < requiredLiters) {
			return {
				success: false,
				message: `Gagal: Stok jerigen tidak mencukupi (Butuh: ${requiredLiters}L, Tersedia: ${state.jerigenStock.toFixed(1)}L)`,
			}
		}

		const updatedPushed = { ...state.activePushedBottles }
		updatedPushed[bottleId] = (updatedPushed[bottleId] || 0) + quantity

		set({
			jerigenStock: state.jerigenStock - requiredLiters,
			bottleStock: {
				...state.bottleStock,
				[bottleId]: (state.bottleStock[bottleId] || 0) + quantity,
			},
			activePushedBottles: updatedPushed,
		})

		const updatedState = get()
		fetch('/api/stock', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jerigen: updatedState.jerigenStock,
				bottles: updatedState.bottleStock,
			}),
		}).catch(() => {})

		fetch('/api/shift/active', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				active_date: updatedState.activeDate,
				cash_in: updatedState.activeCashIn,
				cash_out: updatedState.activeCashOut,
				opening_stocks: updatedState.activeOpeningStock || {},
				pushed_bottles: updatedState.activePushedBottles,
			}),
		}).catch(() => {})

		fetch('/api/shift/transactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				shift_date: updatedState.activeDate,
				transaction_date: transactionDate || new Date().toISOString().split('T')[0],
				type: 'pour',
				product_id: bottleId,
				quantity,
				cost: 0,
			}),
		})
			.then(async r => {
				if (r.ok) {
					const newTx = await r.json()
					set(s => ({ shiftTransactions: [...s.shiftTransactions, newTx] }))
				}
			})
			.catch(() => {})

		return { success: true }
	},

	submitClosingStock: async (closingStocks, uangAkhir, note, closingJerigen) => {
		const state = get()
		if (!state.activeOpeningStock) return { success: false, message: 'Shift belum dibuka' }

		const finalJerigen = closingJerigen !== undefined ? closingJerigen : state.jerigenStock

		const recapInputs: DailyRecapInput[] = state.products.map(p => {
			const opening = state.activeOpeningStock![p.id] || 0
			const poured = state.activePushedBottles[p.id] || 0
			const closing = closingStocks[p.id] || 0
			const openingTotal = opening + poured

			return {
				productId: p.id,
				openingStock: openingTotal,
				closingStock: closing,
			}
		})

		const id = `recap-${Date.now()}`
		const newRecap = {
			...calculateDailyRecap(
				id,
				state.activeDate,
				recapInputs,
				uangAkhir,
				state.activeCashIn + state.activeCashOut,
				state.products,
			),
			uangAwal: state.activeCashIn,
			belanja: state.activeCashOut,
			closingJerigen: finalJerigen,
			note: note || '',
		}

		set({ syncStatus: 'syncing', syncMessage: 'Menyimpan laporan shift malam ke database...' })

		try {
			const response = await fetch('/api/recap/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recaps: [newRecap] }),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				const errorMsg = data.error || `Gagal menyimpan ke server (${response.status})`
				set({ syncStatus: 'error', syncMessage: errorMsg })
				return {
					success: false,
					message: errorMsg,
				}
			}

			// Clear active shift from database
			await fetch('/api/shift/active', { method: 'DELETE' }).catch(() => {})

			const nextBottleStock = { ...state.bottleStock }
			state.products.forEach(p => {
				if (p.id in closingStocks) {
					nextBottleStock[p.id] = closingStocks[p.id]
				}
			})

			const filteredRecaps = state.dailyRecaps.filter(r => r.date !== state.activeDate)

			set({
				dailyRecaps: [newRecap, ...filteredRecaps],
				bottleStock: nextBottleStock,
				jerigenStock: finalJerigen,
				activeOpeningStock: null,
				activePushedBottles: state.products.reduce(
					(acc, p) => {
						acc[p.id] = 0
						return acc
					},
					{} as Record<string, number>,
				),
				activeCashIn: 0,
				activeCashOut: 0,
				syncStatus: 'idle',
				syncMessage: '',
			})

			const updatedState = get()
			fetch('/api/stock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jerigen: updatedState.jerigenStock,
					bottles: updatedState.bottleStock,
				}),
			}).catch(() => {})

			await get().fetchRecapsFromCloud()
			return { success: true }
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Gagal menghubungi server'
			set({ syncStatus: 'error', syncMessage: errorMsg })
			return {
				success: false,
				message: errorMsg,
			}
		}
	},

	submitDailyReport: async (date, uangAwal, uangAkhir, openingStocks, closingStocks, note) => {
		const state = get()

		const recapInputs: DailyRecapInput[] = state.products.map(p => {
			const opening = openingStocks[p.id] || 0
			const closing = closingStocks[p.id] || 0

			return {
				productId: p.id,
				openingStock: opening,
				closingStock: closing,
			}
		})

		const id = `recap-${Date.now()}`
		const newRecap = {
			...calculateDailyRecap(id, date, recapInputs, uangAkhir, uangAwal, state.products),
			uangAwal: uangAwal,
			belanja: 0,
			note: note || '',
		}

		try {
			const response = await fetch('/api/recap/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recaps: [newRecap] }),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				return {
					success: false,
					message: data.error || `Gagal menyimpan ke server (${response.status})`,
				}
			}

			const nextBottleStock = { ...state.bottleStock }
			state.products.forEach(p => {
				if (p.id in closingStocks) {
					nextBottleStock[p.id] = closingStocks[p.id]
				}
			})

			const filteredRecaps = state.dailyRecaps.filter(r => r.date !== date)

			set({
				dailyRecaps: [newRecap, ...filteredRecaps],
				bottleStock: nextBottleStock,
				activeOpeningStock: null,
				activePushedBottles: state.products.reduce(
					(acc, p) => {
						acc[p.id] = 0
						return acc
					},
					{} as Record<string, number>,
				),
				activeCashIn: 0,
				activeCashOut: 0,
			})

			await get().fetchRecapsFromCloud()
			return { success: true }
		} catch (err) {
			return {
				success: false,
				message: err instanceof Error ? err.message : 'Gagal menghubungi server',
			}
		}
	},

	clearAllRecaps: () =>
		set({
			dailyRecaps: [],
			products: PRODUCTS,
			jerigenStock: 0,
			bottleStock: { p1: 0, p2: 0, p3: 0 },
			activeOpeningStock: null,
			activePushedBottles: { p1: 0, p2: 0, p3: 0 },
			activeCashIn: 0,
			activeCashOut: 0,
			shiftTransactions: [],
		}),

	fetchActiveShift: async () => {
		try {
			const response = await fetch('/api/shift/active')
			if (!response.ok) return { success: false, message: `Error ${response.status}` }
			const data = await response.json()
			if (!data) return { success: true } // no active shift

			if (data.latest_closed_shift) {
				set({
					latestClosedShift: data.latest_closed_shift,
					activeDate: '',
					activeOpeningStock: null,
				})
				return { success: true }
			}

			set({
				latestClosedShift: null,
				activeDate: data.active_date,
				activeOpeningStock: data.opening_stocks,
				activePushedBottles: data.pushed_bottles,
				activeCashIn: data.cash_in,
				activeCashOut: data.cash_out,
				jerigenStock:
					data.current_jerigen !== undefined ? data.current_jerigen : get().jerigenStock,
			})
			if (data.active_date) {
				await get().fetchShiftTransactions(data.active_date)
			}
			return { success: true }
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : 'Network error' }
		}
	},

	clearActiveShift: async () => {
		await fetch('/api/shift/active', { method: 'DELETE' }).catch(() => {})
		set({
			activeDate: '',
			activeOpeningStock: null,
			activePushedBottles: { p1: 0, p2: 0, p3: 0 },
			activeCashIn: 0,
			activeCashOut: 0,
			shiftTransactions: [],
		})
	},

	fetchShiftTransactions: async shiftDate => {
		try {
			const r = await fetch(`/api/shift/transactions?shiftDate=${encodeURIComponent(shiftDate)}`)
			if (!r.ok) return { success: false, message: `Error ${r.status}` }
			const txs = await r.json()
			set({ shiftTransactions: txs })
			return { success: true }
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : 'Network error' }
		}
	},

	voidShiftTransaction: async (transactionId: string) => {
		try {
			const res = await fetch(`/api/shift/transactions?id=${encodeURIComponent(transactionId)}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				return { success: false, message: data.error || 'Gagal membatalkan transaksi' }
			}
			await get().fetchActiveShift()
			await get().fetchStockFromCloud()
			return { success: true }
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : 'Network error' }
		}
	},

	adjustJerigenStockWithReason: async (actualLiters: number, reason: string) => {
		try {
			const res = await fetch('/api/shift/adjustment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ actualLiters, reason }),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				return { success: false, message: data.error || 'Gagal menyesuaikan stok jerigen' }
			}
			set({ jerigenStock: actualLiters })
			await get().fetchActiveShift()
			return { success: true }
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : 'Network error' }
		}
	},
})
