import { DailyRecapResult, ProductDefinition } from '../lib/calculations'
import { PaginationMeta } from '../components/common/Pagination'

export type { PaginationMeta }

export interface ShiftTransactionItem {
	id?: string
	shift_date: string
	transaction_date: string
	type: 'purchase' | 'pour'
	product_id?: string
	liters?: number
	quantity?: number
	cost: number
	note?: string
}

export interface SalaryPaymentItem {
	id: string
	date: string
	weekLabel?: string
	amount: number
	recipient?: string
	paymentSource?: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
	shiftId?: string
	note?: string
	createdAt?: string
}

export interface CatalogSliceState {
	products: ProductDefinition[]
	jerigenStock: number
	bottleStock: Record<string, number>
}

export interface CatalogSliceActions {
	addProduct: (product: ProductDefinition) => Promise<{ success: boolean; message?: string }>
	updateProduct: (
		id: string,
		updated: Omit<ProductDefinition, 'id'>,
	) => Promise<{ success: boolean; message?: string }>
	deleteProduct: (id: string) => Promise<{ success: boolean; message?: string }>
	updateJerigenStock: (jerigen: number) => Promise<{ success: boolean; message?: string }>
	fetchStockFromCloud: () => Promise<{ success: boolean; message?: string }>
	fetchProductsFromCloud: () => Promise<{ success: boolean; message?: string }>
}

export interface ShiftSliceState {
	activeDate: string
	activeOpeningStock: Record<string, number> | null
	activePushedBottles: Record<string, number>
	activeCashIn: number
	activeCashOut: number
	shiftTransactions: ShiftTransactionItem[]
	latestClosedShift: {
		shift_date: string
		closing_jerigen: number
		closing_bottles: Record<string, number>
	} | null
}

export interface ShiftSliceActions {
	setOpeningStock: (
		date: string,
		stocks: Record<string, number>,
		uangAwal: number,
		openingJerigen?: number,
	) => Promise<void>
	submitPurchase: (
		liters: number,
		cost: number,
		target: string,
		transactionDate?: string,
	) => { success: boolean; message?: string }
	pourFuelToBottles: (
		bottleId: string,
		quantity: number,
		transactionDate?: string,
	) => { success: boolean; message?: string }
	submitClosingStock: (
		closingStocks: Record<string, number>,
		uangAkhir: number,
		note?: string,
		closingJerigen?: number,
	) => Promise<{ success: boolean; message?: string }>
	submitDailyReport: (
		date: string,
		uangAwal: number,
		uangAkhir: number,
		openingStocks: Record<string, number>,
		closingStocks: Record<string, number>,
		note?: string,
	) => Promise<{ success: boolean; message?: string }>
	clearAllRecaps: () => void
	fetchActiveShift: () => Promise<{ success: boolean; message?: string }>
	clearActiveShift: () => Promise<void>
	fetchShiftTransactions: (shiftDate: string) => Promise<{ success: boolean; message?: string }>
	voidShiftTransaction: (transactionId: string) => Promise<{ success: boolean; message?: string }>
	adjustJerigenStockWithReason: (
		actualLiters: number,
		reason: string,
	) => Promise<{ success: boolean; message?: string }>
}

export interface RecapSliceState {
	dailyRecaps: DailyRecapResult[]
	recapPagination: PaginationMeta
}

export interface RecapSliceActions {
	fetchRecapsFromCloud: (
		page?: number,
		limit?: number,
	) => Promise<{ success: boolean; message?: string }>
	updateRecap: (
		date: string,
		updatedData: {
			cashIn?: number
			cashOut?: number
			uangAwal?: number
			belanja?: number
			note?: string
		},
	) => Promise<{ success: boolean; message?: string }>
	deleteRecap: (date: string) => Promise<{ success: boolean; message?: string }>
}

export interface SalarySliceState {
	salaryPayments: SalaryPaymentItem[]
	salaryPagination: PaginationMeta
}

export interface SalarySliceActions {
	addSalaryPayment: (salary: {
		date: string
		weekLabel?: string
		amount: number
		recipient?: string
		paymentSource?: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
		note?: string
	}) => Promise<{ success: boolean; message?: string }>
	fetchSalaryFromCloud: (
		page?: number,
		limit?: number,
	) => Promise<{ success: boolean; message?: string }>
}

export type SyncStatus = 'idle' | 'fetching' | 'syncing' | 'error'

export interface SyncSliceState {
	syncStatus: SyncStatus
	syncMessage: string
}

export interface SyncSliceActions {
	setSyncStatus: (status: SyncStatus, message?: string) => void
}

export interface FinanceEntryItem {
	id: string
	transactionDate: string
	flowType: 'IN' | 'OUT'
	category:
		| 'SALES_REVENUE'
		| 'FUEL_PURCHASE'
		| 'SALARY_PAYMENT'
		| 'INITIAL_CASH'
		| 'CAPITAL_INJECTION'
		| 'OWNER_WITHDRAWAL'
		| 'OTHER'
	amount: number
	paymentMethod: 'CASH' | 'TRANSFER' | 'QRIS'
	referenceType?: 'RECAP' | 'SALARY' | 'SHIFT_TRANSACTION' | 'MANUAL'
	referenceId?: string
	recapId?: string
	salaryId?: string
	shiftTransactionId?: string
	status: 'COMPLETED' | 'PENDING' | 'CANCELLED'
	createdBy?: string
	updatedBy?: string
	description?: string
	createdAt?: string
}

export interface FinanceSummaryData {
	totalInflow: number
	totalOutflow: number
	netCashflow: number
	categoryBreakdown: Record<string, number>
}

export interface FinanceSliceState {
	financeEntries: FinanceEntryItem[]
	financeSummary: FinanceSummaryData
	financePagination: PaginationMeta
}

export interface FinanceSliceActions {
	fetchFinancesFromCloud: (filters?: {
		page?: number
		limit?: number
		startDate?: string
		endDate?: string
		category?: string
		flowType?: 'IN' | 'OUT'
	}) => Promise<{ success: boolean; message?: string }>
	addFinanceEntry: (entry: {
		transactionDate?: string
		flowType: 'IN' | 'OUT'
		category:
			| 'SALES_REVENUE'
			| 'FUEL_PURCHASE'
			| 'SALARY_PAYMENT'
			| 'INITIAL_CASH'
			| 'CAPITAL_INJECTION'
			| 'OWNER_WITHDRAWAL'
			| 'OTHER'
		amount: number
		paymentMethod?: 'CASH' | 'TRANSFER' | 'QRIS'
		description?: string
	}) => Promise<{ success: boolean; message?: string }>
}

export type GasolineStoreState = CatalogSliceState &
	ShiftSliceState &
	RecapSliceState &
	SalarySliceState &
	SyncSliceState &
	FinanceSliceState
export type GasolineStoreActions = CatalogSliceActions &
	ShiftSliceActions &
	RecapSliceActions &
	SalarySliceActions &
	SyncSliceActions &
	FinanceSliceActions
export type GasolineStore = GasolineStoreState & GasolineStoreActions
