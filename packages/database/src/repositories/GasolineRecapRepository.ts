import { PaginatedResult } from '@retail/types'
import { query, transaction } from '../connection'

export interface GasolineProductRecapRow {
	id?: string
	recap_id?: string
	productId: string
	openingStock: number
	closingStock: number
	soldQty: number
	revenue: number
	capital: number
	profit: number
}

export interface GasolineRecapRow {
	id: string
	date: string
	totalSoldLiters: number
	totalRevenue: number
	totalCapital: number
	totalNetProfit: number
	cashSummary: {
		cashIn: number
		cashOut: number
		netFinanceFlow: number
	}
	uangAwal: number
	belanja: number
	note: string
	items: GasolineProductRecapRow[]
}

export interface SyncRecapItemInput {
	productId: string
	openingStock: number
	closingStock: number
	soldQty?: number
	revenue?: number
	capital?: number
	profit?: number
}

export interface SyncRecapInput {
	id?: string
	date: string
	totalSoldLiters: number
	totalRevenue: number
	totalCapital: number
	totalNetProfit: number
	cashSummary: {
		cashIn: number
		cashOut: number
		netFinanceFlow: number
	}
	uangAwal?: number
	belanja?: number
	openingJerigen?: number
	closingJerigen?: number
	note?: string
	items: SyncRecapItemInput[]
}

export const gasolineRecapRepository = {
	async findAllRecaps(page?: number, limit?: number): Promise<PaginatedResult<GasolineRecapRow>> {
		const validPage = Math.max(1, page || 1)
		const validLimit = Math.min(100, Math.max(1, limit || 20))
		const offset = (validPage - 1) * validLimit

		const countRes = await query(`SELECT COUNT(*) FROM gasoline.shifts WHERE status = 'CLOSED'`)
		const totalItems = Number(countRes.rows[0]?.count || 0)

		const shiftRes = await query(
			`SELECT id, shift_date::text as date, total_sold_liters, total_sales_revenue as total_revenue,
              total_cogs as total_capital, total_net_profit, actual_closing_cash as cash_in,
              total_cash_out as cash_out, cash_variance as net_finance_flow, opening_cash as initial_cash_balance,
              fuel_purchase_cost, variance_note as note
       FROM gasoline.shifts
       WHERE status = 'CLOSED'
       ORDER BY shift_date DESC, shift_number DESC
       LIMIT $1 OFFSET $2`,
			[validLimit, offset],
		)

		const totalPages = Math.ceil(totalItems / validLimit) || 1

		if (shiftRes.rows.length === 0) {
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

		const shiftIds = shiftRes.rows.map((r: Record<string, unknown>) => r.id as string)

		const itemsRes = await query(
			`SELECT id, shift_id as recap_id, product_id, opening_qty as opening_stock,
              closing_qty as closing_stock, sold_qty, revenue, cogs as capital, profit
       FROM gasoline.shift_product_items
       WHERE shift_id = ANY($1::uuid[])`,
			[shiftIds],
		)

		const itemsByShiftId = new Map<string, GasolineProductRecapRow[]>()
		for (const item of itemsRes.rows) {
			const list = itemsByShiftId.get(item.recap_id) || []
			list.push({
				id: item.id,
				recap_id: item.recap_id,
				productId: item.product_id,
				openingStock: Number(item.opening_stock),
				closingStock: Number(item.closing_stock),
				soldQty: Number(item.sold_qty),
				revenue: Number(item.revenue),
				capital: Number(item.capital),
				profit: Number(item.profit),
			})
			itemsByShiftId.set(item.recap_id, list)
		}

		const data = shiftRes.rows.map((r: Record<string, unknown>) => ({
			id: r.id as string,
			date: r.date as string,
			totalSoldLiters: Number(r.total_sold_liters),
			totalRevenue: Number(r.total_revenue),
			totalCapital: Number(r.total_capital),
			totalNetProfit: Number(r.total_net_profit),
			cashSummary: {
				cashIn: Number(r.cash_in),
				cashOut: Number(r.cash_out),
				netFinanceFlow: Number(r.net_finance_flow),
			},
			uangAwal: Number(r.initial_cash_balance || 0),
			belanja: Number(r.fuel_purchase_cost || 0),
			note: (r.note as string) || '',
			items: itemsByShiftId.get(r.id as string) || [],
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

	async syncBatch(recaps: SyncRecapInput[]): Promise<number> {
		if (recaps.length === 0) return 0

		return await transaction(async client => {
			let count = 0

			for (const recap of recaps) {
				const initialCash = recap.uangAwal || 0
				const fuelPurchase = recap.belanja || 0

				const recapRes = await client.query(
					`INSERT INTO gasoline.recaps (
            date, total_sold_liters, total_revenue, total_capital, total_net_profit,
            cash_in, cash_out, net_finance_flow, initial_cash_balance, fuel_purchase_cost, note, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (date) DO UPDATE SET
            total_sold_liters = EXCLUDED.total_sold_liters,
            total_revenue = EXCLUDED.total_revenue,
            total_capital = EXCLUDED.total_capital,
            total_net_profit = EXCLUDED.total_net_profit,
            cash_in = EXCLUDED.cash_in,
            cash_out = EXCLUDED.cash_out,
            net_finance_flow = EXCLUDED.net_finance_flow,
            initial_cash_balance = EXCLUDED.initial_cash_balance,
            fuel_purchase_cost = EXCLUDED.fuel_purchase_cost,
            note = EXCLUDED.note,
            updated_at = NOW()
          RETURNING id`,
					[
						recap.date,
						recap.totalSoldLiters,
						recap.totalRevenue,
						recap.totalCapital,
						recap.totalNetProfit,
						recap.cashSummary.cashIn,
						recap.cashSummary.cashOut,
						recap.cashSummary.netFinanceFlow,
						initialCash,
						fuelPurchase,
						recap.note || null,
					],
				)

				const expectedCash = initialCash + recap.totalRevenue - fuelPurchase
				const actualCash = recap.cashSummary.cashIn
				const variance = actualCash - expectedCash
				const recapId = recapRes.rows[0]?.id

				const closingJerigen =
					recap.closingJerigen !== undefined ? Number(recap.closingJerigen) : null
				const openingJerigen =
					recap.openingJerigen !== undefined ? Number(recap.openingJerigen) : null

				// The shift for this date may already exist with its own id, so use the id the upsert returns
				const shiftRes = await client.query(
					`INSERT INTO gasoline.shifts (
            id, shift_date, shift_number, status, opening_cash, total_sales_revenue, total_cash_out,
            expected_closing_cash, actual_closing_cash, cash_variance, total_sold_liters,
            total_cogs, total_net_profit, fuel_purchase_cost, opening_jerigen, closing_jerigen, current_jerigen,
            variance_note, closed_at, updated_at
          ) VALUES (
            $1, $2::date, 1, 'CLOSED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 0), COALESCE($14, 0), COALESCE($14, 0), $15, NOW(), NOW()
          ) ON CONFLICT (shift_date, shift_number) DO UPDATE SET
            total_sales_revenue = EXCLUDED.total_sales_revenue,
            total_cogs = EXCLUDED.total_cogs,
            total_net_profit = EXCLUDED.total_net_profit,
            total_sold_liters = EXCLUDED.total_sold_liters,
            opening_cash = EXCLUDED.opening_cash,
            actual_closing_cash = EXCLUDED.actual_closing_cash,
            expected_closing_cash = EXCLUDED.expected_closing_cash,
            cash_variance = EXCLUDED.cash_variance,
            fuel_purchase_cost = EXCLUDED.fuel_purchase_cost,
            total_cash_out = EXCLUDED.total_cash_out,
            opening_jerigen = COALESCE($13, gasoline.shifts.opening_jerigen, 0),
            closing_jerigen = COALESCE($14, gasoline.shifts.closing_jerigen, 0),
            current_jerigen = COALESCE($14, gasoline.shifts.current_jerigen, 0),
            variance_note = EXCLUDED.variance_note,
            status = 'CLOSED',
            closed_at = NOW(),
            updated_at = NOW()
          RETURNING id`,
					[
						recapId,
						recap.date,
						initialCash,
						recap.totalRevenue,
						fuelPurchase,
						expectedCash,
						actualCash,
						variance,
						recap.totalSoldLiters,
						recap.totalCapital,
						recap.totalNetProfit,
						fuelPurchase,
						openingJerigen,
						closingJerigen,
						recap.note || null,
					],
				)

				const shiftId = shiftRes.rows[0]?.id

				await client.query(`DELETE FROM gasoline.shift_product_items WHERE shift_id = $1`, [
					shiftId,
				])
				await client.query(`DELETE FROM gasoline.product_recaps WHERE recap_id = $1`, [recapId])

				for (const item of recap.items) {
					await client.query(
						`INSERT INTO gasoline.product_recaps (
              recap_id, product_id, opening_stock, closing_stock, sold_qty, revenue, capital, profit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
						[
							recapId,
							item.productId,
							item.openingStock,
							item.closingStock,
							item.soldQty || 0,
							item.revenue || 0,
							item.capital || 0,
							item.profit || 0,
						],
					)

					await client.query(
						`INSERT INTO gasoline.shift_product_items (
              shift_id, product_id, opening_qty, pushed_qty, current_qty, closing_qty, sold_qty,
              unit_selling_price, unit_cost_price, revenue, cogs, profit
            ) VALUES (
              $1, $2, $3, 0.000, $4, $4, $5::numeric,
              CASE WHEN $5::numeric > 0 THEN ($6::numeric / $5::numeric)::NUMERIC(15, 2) ELSE 0.00 END,
              CASE WHEN $5::numeric > 0 THEN ($7::numeric / $5::numeric)::NUMERIC(15, 2) ELSE 0.00 END,
              $6::numeric, $7::numeric, $8
            ) ON CONFLICT (shift_id, product_id) DO UPDATE SET
              opening_qty = EXCLUDED.opening_qty,
              current_qty = EXCLUDED.current_qty,
              closing_qty = EXCLUDED.closing_qty,
              sold_qty = EXCLUDED.sold_qty,
              revenue = EXCLUDED.revenue,
              cogs = EXCLUDED.cogs,
              profit = EXCLUDED.profit`,
						[
							shiftId,
							item.productId,
							item.openingStock,
							item.closingStock,
							item.soldQty || 0,
							item.revenue || 0,
							item.capital || 0,
							item.profit || 0,
						],
					)
				}

				if (initialCash > 0) {
					await client.query(
						`INSERT INTO gasoline.finances (
              transaction_date, flow_type, category, amount, reference_type, reference_id, recap_id, shift_id, description
            ) VALUES ($1::date, 'IN', 'INITIAL_CASH', $2, 'RECAP', $3, $3, $5, $4)
            ON CONFLICT DO NOTHING`,
						[
							recap.date,
							initialCash,
							recapId,
							`Initial cash float for shift on ${recap.date}`,
							shiftId,
						],
					)
				}

				if (fuelPurchase > 0) {
					await client.query(
						`INSERT INTO gasoline.finances (
              transaction_date, flow_type, category, amount, reference_type, reference_id, recap_id, shift_id, description
            ) VALUES ($1::date, 'OUT', 'FUEL_PURCHASE', $2, 'RECAP', $3, $3, $5, $4)
            ON CONFLICT DO NOTHING`,
						[
							recap.date,
							fuelPurchase,
							recapId,
							`Bulk fuel purchase expense for ${recap.date}`,
							shiftId,
						],
					)
				}

				if (recap.totalRevenue > 0) {
					await client.query(
						`INSERT INTO gasoline.finances (
              transaction_date, flow_type, category, amount, reference_type, reference_id, recap_id, shift_id, description
            ) VALUES ($1::date, 'IN', 'SALES_REVENUE', $2, 'RECAP', $3, $3, $5, $4)
            ON CONFLICT DO NOTHING`,
						[
							recap.date,
							recap.totalRevenue,
							recapId,
							`Sales revenue for shift recap on ${recap.date}`,
							shiftId,
						],
					)
				}

				count++
			}

			return count
		})
	},

	async deleteRecapByDate(date: string): Promise<boolean> {
		return await transaction(async client => {
			const shiftRes = await client.query(
				`SELECT id FROM gasoline.shifts WHERE shift_date = $1::date`,
				[date],
			)
			const recapRes = await client.query(`SELECT id FROM gasoline.recaps WHERE date = $1`, [date])

			if (shiftRes.rows.length === 0 && recapRes.rows.length === 0) return false
			const targetId = shiftRes.rows[0]?.id || recapRes.rows[0]?.id

			await client.query(`DELETE FROM gasoline.finances WHERE shift_id = $1 OR recap_id = $1`, [
				targetId,
			])
			await client.query(`DELETE FROM gasoline.shifts WHERE id = $1`, [targetId])
			const deleteRes = await client.query(`DELETE FROM gasoline.recaps WHERE id = $1`, [targetId])
			return (deleteRes.rowCount ?? 0) > 0 || shiftRes.rows.length > 0
		})
	},
}
