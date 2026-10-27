import { query, transaction } from '../connection'
import { PaginationMeta, PaginatedResult } from '@retail/types'

export interface SalaryPaymentRow {
	id: string
	date: string
	weekLabel?: string
	amount: number
	recipient?: string
	paymentSource?: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
	shiftId?: string
	note?: string
	createdAt?: Date
	updatedAt?: Date
}

export const salaryPaymentRepository = {
	async findAllSalaries(page?: number, limit?: number): Promise<PaginatedResult<SalaryPaymentRow>> {
		const validPage = Math.max(1, page || 1)
		const validLimit = Math.min(100, Math.max(1, limit || 20))
		const offset = (validPage - 1) * validLimit

		const countRes = await query(`SELECT COUNT(*) FROM gasoline.salary_payments`)
		const totalItems = Number(countRes.rows[0]?.count || 0)

		const res = await query(
			`SELECT id, date, week_label, amount, recipient, payment_source, shift_id, note, created_at, updated_at
       FROM gasoline.salary_payments
       ORDER BY date DESC, created_at DESC
       LIMIT $1 OFFSET $2`,
			[validLimit, offset],
		)

		const totalPages = Math.ceil(totalItems / validLimit) || 1

		return {
			data: res.rows.map((row: any) => ({
				id: row.id,
				date: row.date,
				weekLabel: row.week_label || undefined,
				amount: Number(row.amount),
				recipient: row.recipient || undefined,
				paymentSource: row.payment_source || 'CASH_DRAWER',
				shiftId: row.shift_id || undefined,
				note: row.note || undefined,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			})),
			pagination: {
				page: validPage,
				limit: validLimit,
				totalItems,
				totalPages,
				hasNextPage: validPage < totalPages,
				hasPrevPage: validPage > 1,
			},
		}
	},

	async createSalary(data: {
		date: string
		weekLabel?: string
		amount: number
		recipient?: string
		paymentSource?: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
		note?: string
	}): Promise<SalaryPaymentRow> {
		return await transaction(async client => {
			const paymentSource = data.paymentSource || 'CASH_DRAWER'

			// Check for active shift
			const activeShiftRes = await client.query(
				`SELECT id FROM gasoline.shifts WHERE status = 'OPEN' LIMIT 1`,
			)
			const activeShiftId = activeShiftRes.rows[0]?.id || null

			const res = await client.query(
				`INSERT INTO gasoline.salary_payments (
           date, week_label, amount, recipient, payment_source, shift_id, note, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, date, week_label, amount, recipient, payment_source, shift_id, note, created_at, updated_at`,
				[
					data.date,
					data.weekLabel || null,
					data.amount,
					data.recipient || null,
					paymentSource,
					activeShiftId,
					data.note || null,
				],
			)

			const row = res.rows[0]

			// If paid from cash drawer and shift is open, update shift cash out & log expense
			if (paymentSource === 'CASH_DRAWER' && activeShiftId) {
				await client.query(
					`INSERT INTO gasoline.shift_expenses (
             shift_id, category, amount, payment_source, recipient, description, reference_id
           ) VALUES ($1, 'SALARY_PAYMENT', $2, 'CASH_DRAWER', $3, $4, $5)`,
					[
						activeShiftId,
						data.amount,
						data.recipient || 'Employee',
						`Pembayaran gaji ${data.weekLabel || ''}`.trim(),
						row.id,
					],
				)

				await client.query(
					`UPDATE gasoline.shifts
           SET salary_expenses = salary_expenses + $1,
               total_cash_out = total_cash_out + $1,
               expected_closing_cash = expected_closing_cash - $1,
               updated_at = NOW()
           WHERE id = $2`,
					[data.amount, activeShiftId],
				)
			}

			if (data.amount > 0) {
				await client.query(
					`INSERT INTO gasoline.finances (
            transaction_date, flow_type, category, amount, reference_type, reference_id, salary_id, shift_id, description
          ) VALUES ($1::date, 'OUT', 'SALARY_PAYMENT', $2, 'SALARY', $3, $3, $4, $5)`,
					[
						data.date,
						data.amount,
						row.id,
						activeShiftId,
						`Salary payment to ${data.recipient || 'Employee'} (${data.weekLabel || ''})`,
					],
				)
			}

			return {
				id: row.id,
				date: row.date,
				weekLabel: row.week_label || undefined,
				amount: Number(row.amount),
				recipient: row.recipient || undefined,
				paymentSource: row.payment_source,
				shiftId: row.shift_id || undefined,
				note: row.note || undefined,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			}
		})
	},
}
