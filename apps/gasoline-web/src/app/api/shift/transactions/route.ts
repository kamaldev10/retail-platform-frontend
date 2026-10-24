import { NextRequest, NextResponse } from 'next/server'
import { gasolineShiftTransactionRepository, gasolineShiftRepository } from '@retail/database'
import { checkAdminAccess } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		const { searchParams } = new URL(request.url)
		const shiftDate = searchParams.get('shiftDate')
		if (!shiftDate) return NextResponse.json({ error: 'shiftDate is required' }, { status: 400 })
		const txs = await gasolineShiftTransactionRepository.findByShiftDate(shiftDate)
		return NextResponse.json(txs)
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
		const txDate = body.transaction_date || new Date().toISOString().split('T')[0]
		const payload = {
			...body,
			transaction_date: txDate,
		}

		// 1. Insert into legacy shift_transactions table
		const tx = await gasolineShiftTransactionRepository.insert(payload)

		// 2. Sync to unified gasoline.shifts, inventory logs & expenses
		const activeShift = await gasolineShiftRepository.findActiveShift()
		if (activeShift) {
			if (body.type === 'purchase') {
				await gasolineShiftRepository
					.recordPurchase(activeShift.id, {
						target: body.product_id || 'jerigen',
						liters: Number(body.liters || body.quantity || 0),
						quantity: Number(body.quantity || 0),
						cost: Number(body.cost || 0),
						payment_source: 'CASH_DRAWER',
						note: body.note,
					})
					.catch(() => {})
			} else if (body.type === 'pour') {
				await gasolineShiftRepository
					.recordPour(activeShift.id, {
						product_id: body.product_id,
						bottles_count: Number(body.quantity || 0),
						liters: Number(body.liters || 0),
						note: body.note,
					})
					.catch(() => {})
			}
		}

		return NextResponse.json(tx, { status: 201 })
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'id parameter is required' }, { status: 400 })

		const tx = await gasolineShiftTransactionRepository.findById(id)
		if (!tx) {
			return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
		}

		const activeShift = await gasolineShiftRepository.findActiveShift()
		if (activeShift) {
			await gasolineShiftRepository.voidTransaction(activeShift.id, tx)
		}

		await gasolineShiftTransactionRepository.deleteById(id)

		return NextResponse.json({ success: true, message: 'Transaction voided successfully' })
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}
