import { PaginatedResult } from '@retail/types'
import { query, transaction } from '../connection'

export interface ShiftProductItemRow {
	id?: string
	shift_id?: string
	product_id: string
	opening_qty: number
	pushed_qty: number
	current_qty: number
	closing_qty: number
	sold_qty: number
	unit_selling_price: number
	unit_cost_price: number
	revenue: number
	cogs: number
	profit: number
}

export interface ShiftExpenseRow {
	id?: string
	shift_id?: string
	category: 'FUEL_PURCHASE' | 'SALARY_PAYMENT' | 'OPERATIONAL' | 'OWNER_DRAW' | 'OTHER'
	amount: number
	payment_source: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
	recipient?: string
	description?: string
	created_at?: Date
}

export interface ShiftInventoryLogRow {
	id?: string
	shift_id?: string
	action_type:
		| 'PURCHASE_JERIGEN'
		| 'PURCHASE_BOTTLE'
		| 'POUR_TO_BOTTLE'
		| 'LOSS_ADJUSTMENT'
		| 'STOCK_ADJUSTMENT'
		| 'VOID_PURCHASE'
		| 'VOID_POUR'
	product_id?: string
	liters: number
	bottles_qty: number
	cost: number
	expense_id?: string
	note?: string
	created_at?: Date
}

export interface ShiftRow {
	id: string
	shift_date: string
	shift_number: number
	status: 'OPEN' | 'CLOSED' | 'AUDITED'
	opening_cash: number
	total_sales_revenue: number
	total_cash_out: number
	expected_closing_cash: number
	actual_closing_cash: number
	cash_variance: number
	total_sold_liters: number
	total_cogs: number
	total_net_profit: number
	fuel_purchase_cost: number
	salary_expenses: number
	other_expenses: number
	opening_jerigen: number
	purchased_jerigen: number
	poured_jerigen: number
	current_jerigen: number
	closing_jerigen: number
	jerigen_loss: number
	variance_note?: string
	opened_at?: Date
	closed_at?: Date
	items: ShiftProductItemRow[]
	expenses?: ShiftExpenseRow[]
}

export interface OpenShiftInput {
	shift_date: string
	opening_cash: number
	opening_jerigen: number
	opening_bottles: Record<string, number>
}

export interface CloseShiftInput {
	actual_closing_cash: number
	closing_jerigen: number
	closing_bottles: Record<string, number>
	note?: string
}

export interface ShiftPurchaseInput {
	target: 'jerigen' | string
	liters: number
	quantity?: number
	cost: number
	payment_source?: 'CASH_DRAWER' | 'EXTERNAL_TRANSFER' | 'OWNER_POCKET'
	note?: string
}

export interface ShiftPourInput {
	product_id: string
	bottles_count: number
	liters: number
	note?: string
}

export const gasolineShiftRepository = {
	async findActiveShift(): Promise<ShiftRow | null> {
		const res = await query(
			`SELECT id, shift_date::text, shift_number, status, opening_cash, total_sales_revenue, total_cash_out,
              expected_closing_cash, actual_closing_cash, cash_variance, total_sold_liters, total_cogs,
              total_net_profit, fuel_purchase_cost, salary_expenses, other_expenses, opening_jerigen,
              purchased_jerigen, poured_jerigen, current_jerigen, closing_jerigen, jerigen_loss,
              variance_note, opened_at, closed_at
       FROM gasoline.shifts
       WHERE status = 'OPEN'
       ORDER BY opened_at DESC
       LIMIT 1`,
		)

		if (res.rows.length === 0) return null
		const row = res.rows[0]

		const itemsRes = await query(
			`SELECT id, shift_id, product_id, opening_qty, pushed_qty, current_qty, closing_qty, sold_qty,
              unit_selling_price, unit_cost_price, revenue, cogs, profit
       FROM gasoline.shift_product_items
       WHERE shift_id = $1`,
			[row.id],
		)

		const expensesRes = await query(
			`SELECT id, shift_id, category, amount, payment_source, recipient, description, created_at
       FROM gasoline.shift_expenses
       WHERE shift_id = $1
       ORDER BY created_at ASC`,
			[row.id],
		)

		return {
			id: row.id,
			shift_date: row.shift_date,
			shift_number: Number(row.shift_number),
			status: row.status,
			opening_cash: Number(row.opening_cash),
			total_sales_revenue: Number(row.total_sales_revenue),
			total_cash_out: Number(row.total_cash_out),
			expected_closing_cash: Number(row.expected_closing_cash),
			actual_closing_cash: Number(row.actual_closing_cash),
			cash_variance: Number(row.cash_variance),
			total_sold_liters: Number(row.total_sold_liters),
			total_cogs: Number(row.total_cogs),
			total_net_profit: Number(row.total_net_profit),
			fuel_purchase_cost: Number(row.fuel_purchase_cost),
			salary_expenses: Number(row.salary_expenses),
			other_expenses: Number(row.other_expenses),
			opening_jerigen: Number(row.opening_jerigen),
			purchased_jerigen: Number(row.purchased_jerigen),
			poured_jerigen: Number(row.poured_jerigen),
			current_jerigen: Number(row.current_jerigen),
			closing_jerigen: Number(row.closing_jerigen),
			jerigen_loss: Number(row.jerigen_loss),
			variance_note: row.variance_note || undefined,
			opened_at: row.opened_at,
			closed_at: row.closed_at,
			items: itemsRes.rows.map(r => ({
				id: r.id,
				shift_id: r.shift_id,
				product_id: r.product_id,
				opening_qty: Number(r.opening_qty),
				pushed_qty: Number(r.pushed_qty),
				current_qty: Number(r.current_qty),
				closing_qty: Number(r.closing_qty),
				sold_qty: Number(r.sold_qty),
				unit_selling_price: Number(r.unit_selling_price),
				unit_cost_price: Number(r.unit_cost_price),
				revenue: Number(r.revenue),
				cogs: Number(r.cogs),
				profit: Number(r.profit),
			})),
			expenses: expensesRes.rows.map(r => ({
				id: r.id,
				shift_id: r.shift_id,
				category: r.category,
				amount: Number(r.amount),
				payment_source: r.payment_source,
				recipient: r.recipient || undefined,
				description: r.description || undefined,
				created_at: r.created_at,
			})),
		}
	},

	async getLatestClosedShift(): Promise<{
		shift_date: string
		closing_jerigen: number
		closing_bottles: Record<string, number>
	} | null> {
		const res = await query(
			`SELECT id, shift_date::text, closing_jerigen
       FROM gasoline.shifts
       WHERE status = 'CLOSED'
       ORDER BY shift_date DESC, closed_at DESC
       LIMIT 1`,
		)

		if (res.rows.length === 0) return null
		const row = res.rows[0]

		const itemsRes = await query(
			`SELECT product_id, closing_qty FROM gasoline.shift_product_items WHERE shift_id = $1`,
			[row.id],
		)

		const closing_bottles: Record<string, number> = {}
		for (const item of itemsRes.rows) {
			closing_bottles[item.product_id] = Number(item.closing_qty)
		}

		return {
			shift_date: row.shift_date,
			closing_jerigen: Number(row.closing_jerigen),
			closing_bottles,
		}
	},

	async openShift(input: OpenShiftInput): Promise<ShiftRow> {
		return await transaction(async client => {
			const activeCheck = await client.query(
				`SELECT id FROM gasoline.shifts WHERE status = 'OPEN' LIMIT 1`,
			)
			if (activeCheck.rows.length > 0) {
				throw new Error('Shift aktif sudah terbuka. Harap tutup shift berjalan terlebih dahulu.')
			}

			const shiftRes = await client.query(
				`INSERT INTO gasoline.shifts (
          shift_date, shift_number, status, opening_cash, actual_closing_cash, expected_closing_cash,
          cash_variance, opening_jerigen, current_jerigen, closing_jerigen, opened_at, updated_at
        ) VALUES (
          $1::date, 1, 'OPEN', $2, 0.00, $2, 0.00, $3, $3, $3, NOW(), NOW()
        ) RETURNING id, shift_date::text, status, opening_cash, opening_jerigen, current_jerigen`,
				[input.shift_date, input.opening_cash, input.opening_jerigen],
			)

			const shiftId = shiftRes.rows[0].id

			const productsRes = await client.query(
				`SELECT id, volume, selling_price, cost_price FROM gasoline.products ORDER BY created_at ASC, id ASC`,
			)

			const items: ShiftProductItemRow[] = []
			for (const prod of productsRes.rows) {
				const openQty = Number(input.opening_bottles[prod.id] || 0)
				const itemRes = await client.query(
					`INSERT INTO gasoline.shift_product_items (
            shift_id, product_id, opening_qty, pushed_qty, current_qty, closing_qty, sold_qty,
            unit_selling_price, unit_cost_price, revenue, cogs, profit
          ) VALUES (
            $1, $2, $3, 0.000, $3, $3, 0.000, $4, $5, 0.00, 0.00, 0.00
          ) RETURNING id`,
					[shiftId, prod.id, openQty, prod.selling_price, prod.cost_price],
				)

				items.push({
					id: itemRes.rows[0].id,
					shift_id: shiftId,
					product_id: prod.id,
					opening_qty: openQty,
					pushed_qty: 0,
					current_qty: openQty,
					closing_qty: openQty,
					sold_qty: 0,
					unit_selling_price: Number(prod.selling_price),
					unit_cost_price: Number(prod.cost_price),
					revenue: 0,
					cogs: 0,
					profit: 0,
				})
			}

			return {
				id: shiftId,
				shift_date: input.shift_date,
				shift_number: 1,
				status: 'OPEN',
				opening_cash: Number(input.opening_cash),
				total_sales_revenue: 0,
				total_cash_out: 0,
				expected_closing_cash: Number(input.opening_cash),
				actual_closing_cash: 0,
				cash_variance: 0,
				total_sold_liters: 0,
				total_cogs: 0,
				total_net_profit: 0,
				fuel_purchase_cost: 0,
				salary_expenses: 0,
				other_expenses: 0,
				opening_jerigen: Number(input.opening_jerigen),
				purchased_jerigen: 0,
				poured_jerigen: 0,
				current_jerigen: Number(input.opening_jerigen),
				closing_jerigen: Number(input.opening_jerigen),
				jerigen_loss: 0,
				items,
				expenses: [],
			}
		})
	},

	async recordPurchase(
		shiftId: string,
		input: ShiftPurchaseInput,
	): Promise<{ success: boolean; expense_id?: string }> {
		return await transaction(async client => {
			const paymentSource = input.payment_source || 'CASH_DRAWER'
			let expenseId: string | undefined

			if (input.cost > 0) {
				const expRes = await client.query(
					`INSERT INTO gasoline.shift_expenses (
            shift_id, category, amount, payment_source, recipient, description
          ) VALUES ($1, 'FUEL_PURCHASE', $2, $3, 'Distributor BBM', $4)
          RETURNING id`,
					[
						shiftId,
						input.cost,
						paymentSource,
						input.note || `Pembelian bensin ${input.liters}L ke ${input.target}`,
					],
				)
				expenseId = expRes.rows[0].id

				if (paymentSource === 'CASH_DRAWER') {
					await client.query(
						`UPDATE gasoline.shifts
             SET fuel_purchase_cost = fuel_purchase_cost + $1,
                 total_cash_out = total_cash_out + $1,
                 expected_closing_cash = expected_closing_cash - $1,
                 updated_at = NOW()
             WHERE id = $2`,
						[input.cost, shiftId],
					)
				}
			}

			const isJerigen = input.target === 'jerigen'
			const actionType = isJerigen ? 'PURCHASE_JERIGEN' : 'PURCHASE_BOTTLE'
			const productId = isJerigen ? null : input.target
			const bottlesCount = input.quantity || 0

			await client.query(
				`INSERT INTO gasoline.shift_inventory_logs (
          shift_id, action_type, product_id, liters, bottles_qty, cost, expense_id, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					shiftId,
					actionType,
					productId,
					input.liters,
					bottlesCount,
					input.cost,
					expenseId || null,
					input.note || null,
				],
			)

			if (isJerigen) {
				await client.query(
					`UPDATE gasoline.shifts
           SET purchased_jerigen = purchased_jerigen + $1,
               current_jerigen = current_jerigen + $1,
               updated_at = NOW()
           WHERE id = $2`,
					[input.liters, shiftId],
				)
			} else {
				await client.query(
					`UPDATE gasoline.shift_product_items
           SET pushed_qty = pushed_qty + $1,
               current_qty = current_qty + $1,
               updated_at = NOW()
           WHERE shift_id = $2 AND product_id = $3`,
					[bottlesCount, shiftId, productId],
				)
			}

			return { success: true, expense_id: expenseId }
		})
	},

	async recordPour(shiftId: string, input: ShiftPourInput): Promise<boolean> {
		return await transaction(async client => {
			const shiftRes = await client.query(
				`SELECT current_jerigen FROM gasoline.shifts WHERE id = $1`,
				[shiftId],
			)
			if (shiftRes.rows.length === 0) throw new Error('Shift tidak ditemukan')

			const currentJerigen = Number(shiftRes.rows[0].current_jerigen)
			if (currentJerigen < input.liters) {
				throw new Error(
					`Stok jerigen tidak mencukupi (Butuh: ${input.liters}L, Tersedia: ${currentJerigen.toFixed(1)}L)`,
				)
			}

			await client.query(
				`INSERT INTO gasoline.shift_inventory_logs (
          shift_id, action_type, product_id, liters, bottles_qty, cost, note
        ) VALUES ($1, 'POUR_TO_BOTTLE', $2, $3, $4, 0.00, $5)`,
				[
					shiftId,
					input.product_id,
					input.liters,
					input.bottles_count,
					input.note || `Tuang ${input.bottles_count} botol ${input.product_id} (${input.liters}L)`,
				],
			)

			await client.query(
				`UPDATE gasoline.shifts
         SET poured_jerigen = poured_jerigen + $1,
             current_jerigen = current_jerigen - $1,
             updated_at = NOW()
         WHERE id = $2`,
				[input.liters, shiftId],
			)

			await client.query(
				`UPDATE gasoline.shift_product_items
         SET pushed_qty = pushed_qty + $1,
             current_qty = current_qty + $1,
             updated_at = NOW()
         WHERE shift_id = $2 AND product_id = $3`,
				[input.bottles_count, shiftId, input.product_id],
			)

			return true
		})
	},

	async closeShift(shiftId: string, input: CloseShiftInput): Promise<ShiftRow> {
		return await transaction(async client => {
			const shiftRes = await client.query(`SELECT * FROM gasoline.shifts WHERE id = $1`, [shiftId])
			if (shiftRes.rows.length === 0) throw new Error('Shift tidak ditemukan')
			const shift = shiftRes.rows[0]

			const itemsRes = await client.query(
				`SELECT spi.*, p.volume
         FROM gasoline.shift_product_items spi
         JOIN gasoline.products p ON p.id = spi.product_id
         WHERE spi.shift_id = $1`,
				[shiftId],
			)

			let totalSoldLiters = 0
			let totalSalesRevenue = 0
			let totalCogs = 0
			let totalNetProfit = 0

			const updatedItems: ShiftProductItemRow[] = []

			for (const item of itemsRes.rows) {
				const opening = Number(item.opening_qty)
				const pushed = Number(item.pushed_qty)
				const closing = Number(input.closing_bottles[item.product_id] ?? item.current_qty)
				const available = opening + pushed
				const sold = Math.max(0, available - closing)

				const unitPrice = Number(item.unit_selling_price)
				const unitCost = Number(item.unit_cost_price)
				const rev = sold * unitPrice
				const cogs = sold * unitCost
				const profit = rev - cogs

				totalSoldLiters += sold * Number(item.volume)
				totalSalesRevenue += rev
				totalCogs += cogs
				totalNetProfit += profit

				await client.query(
					`UPDATE gasoline.shift_product_items
           SET closing_qty = $1,
               current_qty = $1,
               sold_qty = $2,
               revenue = $3,
               cogs = $4,
               profit = $5,
               updated_at = NOW()
           WHERE id = $6`,
					[closing, sold, rev, cogs, profit, item.id],
				)

				updatedItems.push({
					id: item.id,
					shift_id: shiftId,
					product_id: item.product_id,
					opening_qty: opening,
					pushed_qty: pushed,
					current_qty: closing,
					closing_qty: closing,
					sold_qty: sold,
					unit_selling_price: unitPrice,
					unit_cost_price: unitCost,
					revenue: rev,
					cogs,
					profit,
				})
			}

			const openingCash = Number(shift.opening_cash)
			const totalCashOut = Number(shift.total_cash_out)
			const expectedClosingCash = openingCash + totalSalesRevenue - totalCashOut
			const actualClosingCash = Number(input.actual_closing_cash)
			const cashVariance = actualClosingCash - expectedClosingCash

			const expectedJerigen =
				Number(shift.opening_jerigen) +
				Number(shift.purchased_jerigen) -
				Number(shift.poured_jerigen)
			const actualClosingJerigen = Number(input.closing_jerigen)
			const jerigenLoss = expectedJerigen - actualClosingJerigen

			await client.query(
				`UPDATE gasoline.shifts
         SET status = 'CLOSED',
             total_sales_revenue = $1,
             total_cogs = $2,
             total_net_profit = $3,
             total_sold_liters = $4,
             expected_closing_cash = $5,
             actual_closing_cash = $6,
             cash_variance = $7,
             closing_jerigen = $8,
             current_jerigen = $8,
             jerigen_loss = $9,
             variance_note = $10,
             closed_at = NOW(),
             updated_at = NOW()
         WHERE id = $11`,
				[
					totalSalesRevenue,
					totalCogs,
					totalNetProfit,
					totalSoldLiters,
					expectedClosingCash,
					actualClosingCash,
					cashVariance,
					actualClosingJerigen,
					jerigenLoss,
					input.note || null,
					shiftId,
				],
			)

			// Record central finance entries
			if (totalSalesRevenue > 0) {
				await client.query(
					`INSERT INTO gasoline.finances (
            transaction_date, flow_type, category, amount, reference_type, reference_id, shift_id, description
          ) VALUES ($1::date, 'IN', 'SALES_REVENUE', $2, 'RECAP', $3, $3, $4)
          ON CONFLICT DO NOTHING`,
					[
						shift.shift_date,
						totalSalesRevenue,
						shiftId,
						`Sales revenue for shift on ${shift.shift_date}`,
					],
				)
			}

			if (openingCash > 0) {
				await client.query(
					`INSERT INTO gasoline.finances (
            transaction_date, flow_type, category, amount, reference_type, reference_id, shift_id, description
          ) VALUES ($1::date, 'IN', 'INITIAL_CASH', $2, 'RECAP', $3, $3, $4)
          ON CONFLICT DO NOTHING`,
					[
						shift.shift_date,
						openingCash,
						shiftId,
						`Initial cash float for shift on ${shift.shift_date}`,
					],
				)
			}

			return {
				id: shiftId,
				shift_date: shift.shift_date,
				shift_number: Number(shift.shift_number),
				status: 'CLOSED',
				opening_cash: openingCash,
				total_sales_revenue: totalSalesRevenue,
				total_cash_out: totalCashOut,
				expected_closing_cash: expectedClosingCash,
				actual_closing_cash: actualClosingCash,
				cash_variance: cashVariance,
				total_sold_liters: totalSoldLiters,
				total_cogs: totalCogs,
				total_net_profit: totalNetProfit,
				fuel_purchase_cost: Number(shift.fuel_purchase_cost),
				salary_expenses: Number(shift.salary_expenses),
				other_expenses: Number(shift.other_expenses),
				opening_jerigen: Number(shift.opening_jerigen),
				purchased_jerigen: Number(shift.purchased_jerigen),
				poured_jerigen: Number(shift.poured_jerigen),
				current_jerigen: actualClosingJerigen,
				closing_jerigen: actualClosingJerigen,
				jerigen_loss: jerigenLoss,
				variance_note: input.note || undefined,
				items: updatedItems,
			}
		})
	},

	async findAllShifts(page?: number, limit?: number): Promise<PaginatedResult<ShiftRow>> {
		const validPage = Math.max(1, page || 1)
		const validLimit = Math.min(100, Math.max(1, limit || 20))
		const offset = (validPage - 1) * validLimit

		const countRes = await query(`SELECT COUNT(*) FROM gasoline.shifts WHERE status = 'CLOSED'`)
		const totalItems = Number(countRes.rows[0]?.count || 0)

		const res = await query(
			`SELECT id, shift_date::text, shift_number, status, opening_cash, total_sales_revenue, total_cash_out,
              expected_closing_cash, actual_closing_cash, cash_variance, total_sold_liters, total_cogs,
              total_net_profit, fuel_purchase_cost, salary_expenses, other_expenses, opening_jerigen,
              purchased_jerigen, poured_jerigen, current_jerigen, closing_jerigen, jerigen_loss,
              variance_note, opened_at, closed_at
       FROM gasoline.shifts
       WHERE status = 'CLOSED'
       ORDER BY shift_date DESC, shift_number DESC
       LIMIT $1 OFFSET $2`,
			[validLimit, offset],
		)

		const totalPages = Math.ceil(totalItems / validLimit) || 1

		if (res.rows.length === 0) {
			return {
				data: [],
				pagination: {
					page: validPage,
					limit: validLimit,
					totalItems,
					totalPages,
					hasNextPage: validPage < totalPages,
					hasPrevPage: validPage > 1,
				},
			}
		}

		const shiftIds = res.rows.map(r => r.id)
		const itemsRes = await query(
			`SELECT id, shift_id, product_id, opening_qty, pushed_qty, current_qty, closing_qty, sold_qty,
              unit_selling_price, unit_cost_price, revenue, cogs, profit
       FROM gasoline.shift_product_items
       WHERE shift_id = ANY($1::uuid[])`,
			[shiftIds],
		)

		const itemsByShiftId = new Map<string, ShiftProductItemRow[]>()
		for (const item of itemsRes.rows) {
			const list = itemsByShiftId.get(item.shift_id) || []
			list.push({
				id: item.id,
				shift_id: item.shift_id,
				product_id: item.product_id,
				opening_qty: Number(item.opening_qty),
				pushed_qty: Number(item.pushed_qty),
				current_qty: Number(item.current_qty),
				closing_qty: Number(item.closing_qty),
				sold_qty: Number(item.sold_qty),
				unit_selling_price: Number(item.unit_selling_price),
				unit_cost_price: Number(item.unit_cost_price),
				revenue: Number(item.revenue),
				cogs: Number(item.cogs),
				profit: Number(item.profit),
			})
			itemsByShiftId.set(item.shift_id, list)
		}

		const data: ShiftRow[] = res.rows.map(row => ({
			id: row.id,
			shift_date: row.shift_date,
			shift_number: Number(row.shift_number),
			status: row.status,
			opening_cash: Number(row.opening_cash),
			total_sales_revenue: Number(row.total_sales_revenue),
			total_cash_out: Number(row.total_cash_out),
			expected_closing_cash: Number(row.expected_closing_cash),
			actual_closing_cash: Number(row.actual_closing_cash),
			cash_variance: Number(row.cash_variance),
			total_sold_liters: Number(row.total_sold_liters),
			total_cogs: Number(row.total_cogs),
			total_net_profit: Number(row.total_net_profit),
			fuel_purchase_cost: Number(row.fuel_purchase_cost),
			salary_expenses: Number(row.salary_expenses),
			other_expenses: Number(row.other_expenses),
			opening_jerigen: Number(row.opening_jerigen),
			purchased_jerigen: Number(row.purchased_jerigen),
			poured_jerigen: Number(row.poured_jerigen),
			current_jerigen: Number(row.current_jerigen),
			closing_jerigen: Number(row.closing_jerigen),
			jerigen_loss: Number(row.jerigen_loss),
			variance_note: row.variance_note || undefined,
			opened_at: row.opened_at,
			closed_at: row.closed_at,
			items: itemsByShiftId.get(row.id) || [],
		}))

		return {
			data,
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

	async voidTransaction(
		shiftId: string,
		tx: {
			id?: string
			type: 'purchase' | 'pour'
			product_id?: string
			liters?: number
			quantity?: number
			cost: number
			note?: string
		},
	): Promise<void> {
		return await transaction(async client => {
			const liters = Number(tx.liters || tx.quantity || 0)
			const qty = Number(tx.quantity || 0)
			const cost = Number(tx.cost || 0)

			if (tx.type === 'purchase') {
				const isJerigen = !tx.product_id || tx.product_id === 'jerigen'
				if (isJerigen) {
					await client.query(
						`UPDATE gasoline.shifts
                         SET purchased_jerigen = GREATEST(0, purchased_jerigen - $1),
                             current_jerigen = GREATEST(0, current_jerigen - $1),
                             total_cash_out = GREATEST(0, total_cash_out - $2),
                             fuel_purchase_cost = GREATEST(0, fuel_purchase_cost - $2),
                             updated_at = NOW()
                         WHERE id = $3`,
						[liters, cost, shiftId],
					)
					await client.query(
						`UPDATE gasoline.live_stock
                         SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
                         WHERE product_id = '__jerigen__'`,
						[liters],
					)
				} else {
					await client.query(
						`UPDATE gasoline.shift_product_items
                         SET pushed_qty = GREATEST(0, pushed_qty - $1),
                             current_qty = GREATEST(0, current_qty - $1),
                             updated_at = NOW()
                         WHERE shift_id = $2 AND product_id = $3`,
						[qty, shiftId, tx.product_id],
					)
					await client.query(
						`UPDATE gasoline.shifts
                         SET total_cash_out = GREATEST(0, total_cash_out - $1),
                             fuel_purchase_cost = GREATEST(0, fuel_purchase_cost - $1),
                             updated_at = NOW()
                         WHERE id = $2`,
						[cost, shiftId],
					)
					await client.query(
						`UPDATE gasoline.live_stock
                         SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
                         WHERE product_id = $2`,
						[qty, tx.product_id],
					)
				}

				if (cost > 0) {
					await client.query(
						`DELETE FROM gasoline.shift_expenses
                         WHERE id = (
                             SELECT id FROM gasoline.shift_expenses
                             WHERE shift_id = $1 AND category = 'FUEL_PURCHASE' AND amount = $2
                             ORDER BY created_at DESC LIMIT 1
                         )`,
						[shiftId, cost],
					)
					await client.query(
						`DELETE FROM gasoline.finances
                         WHERE id = (
                             SELECT id FROM gasoline.finances
                             WHERE shift_id = $1 AND category = 'FUEL_PURCHASE' AND amount = $2
                             ORDER BY created_at DESC LIMIT 1
                         )`,
						[shiftId, cost],
					)
				}

				await client.query(
					`INSERT INTO gasoline.shift_inventory_logs (
                        shift_id, action_type, product_id, liters, bottles_qty, cost, note
                    ) VALUES ($1, 'VOID_PURCHASE', $2, $3, $4, $5, $6)`,
					[
						shiftId,
						tx.product_id || null,
						liters,
						qty,
						cost,
						`Batalkan pembelian: ${tx.note || tx.id || ''}`,
					],
				)
			} else if (tx.type === 'pour') {
				await client.query(
					`UPDATE gasoline.shifts
                     SET poured_jerigen = GREATEST(0, poured_jerigen - $1),
                         current_jerigen = current_jerigen + $1,
                         updated_at = NOW()
                     WHERE id = $2`,
					[liters, shiftId],
				)
				await client.query(
					`UPDATE gasoline.live_stock
                     SET quantity = quantity + $1, updated_at = NOW()
                     WHERE product_id = '__jerigen__'`,
					[liters],
				)
				if (tx.product_id) {
					await client.query(
						`UPDATE gasoline.shift_product_items
                         SET pushed_qty = GREATEST(0, pushed_qty - $1),
                             current_qty = GREATEST(0, current_qty - $1),
                             updated_at = NOW()
                         WHERE shift_id = $2 AND product_id = $3`,
						[qty, shiftId, tx.product_id],
					)
					await client.query(
						`UPDATE gasoline.live_stock
                         SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
                         WHERE product_id = $2`,
						[qty, tx.product_id],
					)
				}

				await client.query(
					`INSERT INTO gasoline.shift_inventory_logs (
                        shift_id, action_type, product_id, liters, bottles_qty, cost, note
                    ) VALUES ($1, 'VOID_POUR', $2, $3, $4, 0.00, $5)`,
					[
						shiftId,
						tx.product_id || null,
						liters,
						qty,
						`Batalkan tuang botol: ${tx.note || tx.id || ''}`,
					],
				)
			}
		})
	},

	async adjustJerigenStock(
		shiftId: string | null,
		actualLiters: number,
		reason: string,
	): Promise<{ previous: number; current: number; difference: number }> {
		return await transaction(async client => {
			let currentJerigen = 0
			if (shiftId) {
				const shiftRes = await client.query(
					`SELECT current_jerigen FROM gasoline.shifts WHERE id = $1`,
					[shiftId],
				)
				if (shiftRes.rows.length > 0) {
					currentJerigen = Number(shiftRes.rows[0].current_jerigen)
				}
			} else {
				const stockRes = await client.query(
					`SELECT quantity FROM gasoline.live_stock WHERE product_id = '__jerigen__'`,
				)
				currentJerigen = Number(stockRes.rows[0]?.quantity || 0)
			}

			const difference = actualLiters - currentJerigen

			if (shiftId) {
				await client.query(
					`UPDATE gasoline.shifts
                     SET current_jerigen = $1, updated_at = NOW()
                     WHERE id = $2`,
					[actualLiters, shiftId],
				)

				await client.query(
					`INSERT INTO gasoline.shift_inventory_logs (
                        shift_id, action_type, product_id, liters, bottles_qty, cost, note
                    ) VALUES ($1, 'STOCK_ADJUSTMENT', null, $2, 0.000, 0.00, $3)`,
					[shiftId, difference, reason || 'Penyesuaian stok jerigen fisik'],
				)
			}

			await client.query(
				`INSERT INTO gasoline.live_stock (product_id, quantity, updated_at)
                 VALUES ('__jerigen__', $1, NOW())
                 ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
				[actualLiters],
			)

			return { previous: currentJerigen, current: actualLiters, difference }
		})
	},
}
