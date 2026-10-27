import { NextRequest, NextResponse } from 'next/server'
import { salaryPaymentRepository } from '@retail/database'
import { checkAdminAccess } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json(
				{ error: 'Unauthorized', details: auth.error },
				{ status: auth.error?.includes('Forbidden') ? 403 : 401 },
			)
		}

		const { searchParams } = new URL(request.url)
		const page = Number(searchParams.get('page')) || 1
		const limit = Number(searchParams.get('limit')) || 20

		const result = await salaryPaymentRepository.findAllSalaries(page, limit)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to fetch salary payments:', error)
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json(
				{ error: 'Unauthorized', details: auth.error },
				{ status: auth.error?.includes('Forbidden') ? 403 : 401 },
			)
		}

		const body = await request.json()
		const { date, weekLabel, amount, recipient, paymentSource, note } = body

		if (!date || !amount || amount <= 0) {
			return NextResponse.json(
				{ error: 'Bad Request', details: 'Date and valid amount are required' },
				{ status: 400 },
			)
		}

		const salary = await salaryPaymentRepository.createSalary({
			date,
			weekLabel: weekLabel || undefined,
			amount: Number(amount),
			recipient: recipient || undefined,
			paymentSource: paymentSource || 'CASH_DRAWER',
			note: note || undefined,
		})

		return NextResponse.json(salary, { status: 201 })
	} catch (error) {
		console.error('Failed to create salary payment:', error)
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}
