import { createClient } from '@supabase/supabase-js'
import { pool } from './connection'
import { gasolineLiveStockRepository } from './repositories/GasolineLiveStockRepository'
import { gasolineRecapRepository } from './repositories/GasolineRecapRepository'
import { gasolineShiftTransactionRepository } from './repositories/GasolineShiftTransactionRepository'
import { salaryPaymentRepository } from './repositories/SalaryPaymentRepository'
import { userRepository } from './repositories/UserRepository'

async function main() {
	const name = process.env.SEED_ADMIN_NAME || 'ali musthafa kamal'
	const email = process.env.SEED_ADMIN_EMAIL || 'alimusthafakamal@gmail.com'
	const password = process.env.SEED_ADMIN_PASSWORD || 'admin123'

	console.log(`\n🚀 Starting database seeding...`)
	console.log(`Target Admin: "${name}" <${email}>`)

	// 1. Create Admin & Operator users in Supabase Auth if Service Role key is available
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

	if (supabaseUrl && serviceKey) {
		console.log('🔄 Connecting to Supabase Auth API...')
		const supabase = createClient(supabaseUrl, serviceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		})

		const { data: listData, error: listError } = await supabase.auth.admin.listUsers()

		if (listError) {
			console.warn('⚠️ Warning: Could not list Supabase Auth users:', listError.message)
		} else {
			// Ensure Admin in Supabase Auth
			const existingAdmin = listData.users.find(u => u.email === email)
			if (!existingAdmin) {
				console.log('➕ Creating Admin account in Supabase Auth...')
				await supabase.auth.admin.createUser({
					email,
					password,
					email_confirm: true,
				})
				console.log('✅ Admin account created in Supabase Auth.')
			} else {
				console.log('✅ Admin already exists in Supabase Auth.')
			}

			// Ensure Operator in Supabase Auth
			const operatorEmail = 'kasir.gasoline@retail.com'
			const existingOperator = listData.users.find(u => u.email === operatorEmail)
			if (!existingOperator) {
				console.log('➕ Creating Operator account in Supabase Auth...')
				await supabase.auth.admin.createUser({
					email: operatorEmail,
					password: 'operator123',
					email_confirm: true,
				})
				console.log('✅ Operator account created in Supabase Auth.')
			}
		}
	} else {
		console.warn('⚠️ Warning: Supabase Service Role Key missing. Skipping Auth user creation.')
	}

	// 2. Upsert users in PostgreSQL common.users
	console.log('🔄 Seeding users in common.users table...')
	const adminUser = await userRepository.upsertUser({
		name,
		email,
		password,
		role: 'ADMIN',
	})
	console.log('✅ Admin record upserted:', adminUser.id)

	await userRepository.upsertUser({
		name: 'Kasir Shift Pagi',
		email: 'kasir.gasoline@retail.com',
		password: 'operator123',
		role: 'POS_STAFF',
	})
	console.log('✅ Operator record upserted.')

	// 3. Seed Live Stock (gasoline.live_stock)
	console.log('🔄 Seeding live stock in gasoline.live_stock table...')
	await gasolineLiveStockRepository.upsertMany([
		{ product_id: '__jerigen__', quantity: 35.5 },
		{ product_id: 'p1', quantity: 24 },
		{ product_id: 'p2', quantity: 18 },
		{ product_id: 'p3', quantity: 12 },
	])
	console.log('✅ Live stock seeded successfully.')

	// 4. Seed Daily Shift Recaps (gasoline.recaps & product_recaps)
	console.log('🔄 Seeding historical daily recaps in gasoline.recaps table...')
	await gasolineRecapRepository.syncBatch([
		{
			date: '2026-08-06',
			totalSoldLiters: 25.4,
			totalRevenue: 320000,
			totalCapital: 250000,
			totalNetProfit: 70000,
			cashSummary: {
				cashIn: 320000,
				cashOut: 0,
				netFinanceFlow: 320000,
			},
			uangAwal: 100000,
			belanja: 0,
			note: 'Shift lancar, selisih 0',
			items: [
				{
					productId: 'p1',
					openingStock: 25,
					closingStock: 15,
					soldQty: 10,
					revenue: 120000,
					capital: 100000,
					profit: 20000,
				},
				{
					productId: 'p2',
					openingStock: 20,
					closingStock: 10,
					soldQty: 10,
					revenue: 150000,
					capital: 120000,
					profit: 30000,
				},
				{
					productId: 'p3',
					openingStock: 10,
					closingStock: 7,
					soldQty: 3,
					revenue: 60000,
					capital: 45000,
					profit: 15000,
				},
			],
		},
		{
			date: '2026-08-07',
			totalSoldLiters: 38.0,
			totalRevenue: 480000,
			totalCapital: 380000,
			totalNetProfit: 100000,
			cashSummary: {
				cashIn: 480000,
				cashOut: 50000,
				netFinanceFlow: 430000,
			},
			uangAwal: 100000,
			belanja: 50000,
			note: 'Beli kemasan botol tambahan 50k',
			items: [
				{
					productId: 'p1',
					openingStock: 30,
					closingStock: 15,
					soldQty: 15,
					revenue: 180000,
					capital: 150000,
					profit: 30000,
				},
				{
					productId: 'p2',
					openingStock: 20,
					closingStock: 10,
					soldQty: 10,
					revenue: 150000,
					capital: 120000,
					profit: 30000,
				},
				{
					productId: 'p3',
					openingStock: 15,
					closingStock: 8,
					soldQty: 7,
					revenue: 140000,
					capital: 105000,
					profit: 35000,
				},
			],
		},
		{
			date: '2026-08-08',
			totalSoldLiters: 42.5,
			totalRevenue: 550000,
			totalCapital: 430000,
			totalNetProfit: 120000,
			cashSummary: {
				cashIn: 550000,
				cashOut: 0,
				netFinanceFlow: 550000,
			},
			uangAwal: 100000,
			belanja: 0,
			note: 'Penjualan ramai akhir pekan',
			items: [
				{
					productId: 'p1',
					openingStock: 30,
					closingStock: 10,
					soldQty: 20,
					revenue: 240000,
					capital: 200000,
					profit: 40000,
				},
				{
					productId: 'p2',
					openingStock: 20,
					closingStock: 10,
					soldQty: 10,
					revenue: 150000,
					capital: 120000,
					profit: 30000,
				},
				{
					productId: 'p3',
					openingStock: 12,
					closingStock: 4,
					soldQty: 8,
					revenue: 160000,
					capital: 120000,
					profit: 40000,
				},
			],
		},
	])
	console.log('✅ Daily shift recaps seeded successfully.')

	// 5. Seed Shift Transactions (gasoline.shift_transactions)
	console.log('🔄 Seeding shift transaction logs...')
	await gasolineShiftTransactionRepository.insert({
		shift_date: '2026-08-08',
		transaction_date: '2026-08-08',
		type: 'purchase',
		product_id: undefined,
		liters: 20.0,
		quantity: 20.0,
		cost: 200000,
		note: 'Refill Jerigen Bulk 20L',
	})

	await gasolineShiftTransactionRepository.insert({
		shift_date: '2026-08-08',
		transaction_date: '2026-08-08',
		type: 'pour',
		product_id: 'p1',
		liters: 5.0,
		quantity: 5,
		cost: 0,
		note: 'Tuang 5 botol Premium 1L',
	})
	console.log('✅ Shift transactions seeded successfully.')

	// 6. Seed Salary Payments (gasoline.salary_payments)
	console.log('🔄 Seeding salary payments in gasoline.salary_payments table...')
	const existingSalaries = await salaryPaymentRepository.findAllSalaries()
	if (existingSalaries.data.length === 0) {
		await salaryPaymentRepository.createSalary({
			date: '2026-08-07',
			weekLabel: 'Minggu ke-1 Agustus 2026',
			amount: 350000,
			recipient: 'Kasir Shift Pagi',
			note: 'Gaji mingguan operasional pertamini',
		})
		console.log('✅ Salary payment record seeded successfully.')
	} else {
		console.log('✅ Salary payments already exist. Skipping salary seed.')
	}

	console.log('\n🎉 Database seeding completed successfully!\n')
}

main()
	.catch(e => {
		console.error('❌ Seeding failed with error:', e)
		process.exit(1)
	})
	.finally(async () => {
		await pool.end()
	})
