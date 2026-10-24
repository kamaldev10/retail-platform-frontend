import { NextRequest, NextResponse } from 'next/server'
import { gasolineShiftRepository } from '@retail/database'
import { checkAdminAccess } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
	try {
		const auth = await checkAdminAccess()
		if (!auth.authorized) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		const body = await request.json()
		const actualLiters = Number(body.actualLiters)
		const reason = String(body.reason || '').trim()

		if (isNaN(actualLiters) || actualLiters < 0 || actualLiters > 50) {
			return NextResponse.json(
				{ error: 'Stok fisik jerigen harus antara 0 sampai 50 Liter' },
				{ status: 400 },
			)
		}

		if (!reason) {
			return NextResponse.json(
				{ error: 'Alasan penyesuaian stok jerigen wajib diisi' },
				{ status: 400 },
			)
		}

		const activeShift = await gasolineShiftRepository.findActiveShift()
		const result = await gasolineShiftRepository.adjustJerigenStock(
			activeShift ? activeShift.id : null,
			actualLiters,
			reason,
		)

		return NextResponse.json({
			success: true,
			data: result,
		})
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 })
	}
}
