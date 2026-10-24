import { NextRequest, NextResponse } from 'next/server'
import {
	gasolineActiveShiftRepository,
	gasolineShiftRepository,
	gasolineLiveStockRepository,
} from '@retail/database'
import { checkAdminAccess } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// 1. Check unified shifts table
		const activeShift = await gasolineShiftRepository.findActiveShift()
		if (activeShift) {
			const openingStocks: Record<string, number> = {}
			const pushedBottles: Record<string, number> = {}
			const currentBottles: Record<string, number> = {}

			for (const item of activeShift.items) {
				openingStocks[item.product_id] = item.opening_qty
				pushedBottles[item.product_id] = item.pushed_qty
				currentBottles[item.product_id] = item.current_qty
			}

			return NextResponse.json({
				id: activeShift.id,
				active_date: activeShift.shift_date,
				status: activeShift.status,
				cash_in: activeShift.opening_cash,
				cash_out: activeShift.total_cash_out,
				opening_stocks: openingStocks,
				pushed_bottles: pushedBottles,
				current_bottles: currentBottles,
				opening_jerigen: activeShift.opening_jerigen,
				current_jerigen: activeShift.current_jerigen,
				salary_expenses: activeShift.salary_expenses,
				fuel_purchase_cost: activeShift.fuel_purchase_cost,
			})
		}

		// 2. Check fallback legacy active shift
		const legacyShift = await gasolineActiveShiftRepository.get()
		if (legacyShift && legacyShift.active_date) {
			return NextResponse.json(legacyShift)
		}

		// 3. If no active shift, return latest closed shift stock for auto-fill opening
		const latestClosed = await gasolineShiftRepository.getLatestClosedShift()
		if (latestClosed) {
			return NextResponse.json({ latest_closed_shift: latestClosed })
		}

		return NextResponse.json(null)
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json()

		// Legacy table sync
		await gasolineActiveShiftRepository.upsert(body).catch(err => {
			console.error('[POST /api/shift/active] legacy active_shift upsert error:', err)
		})

		// Unified shifts table sync
		if (body.active_date && body.opening_stocks) {
			const activeShift = await gasolineShiftRepository.findActiveShift()
			if (!activeShift) {
				const stockRows = await gasolineLiveStockRepository.getAll().catch(() => [])
				const jerigenQty = stockRows.find(r => r.product_id === '__jerigen__')?.quantity ?? 0

				await gasolineShiftRepository
					.openShift({
						shift_date: body.active_date,
						opening_cash: Number(body.cash_in || 0),
						opening_jerigen:
							body.opening_jerigen !== undefined ? Number(body.opening_jerigen) : jerigenQty,
						opening_bottles: body.opening_stocks as Record<string, number>,
					})
					.catch(err => {
						console.error('[POST /api/shift/active] unified shifts openShift error:', err)
					})
			}
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}

export async function DELETE() {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		await gasolineActiveShiftRepository.clear().catch(() => {})
		return NextResponse.json({ success: true })
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}
