import fs from 'fs'
import path from 'path'
import { pool } from './connection'

async function runMigrations() {
	const dbUrl = process.env.DATABASE_URL || ''
	const maskedHost = dbUrl.includes('@') ? dbUrl.split('@')[1].split('/')[0] : 'localhost'
	console.log(`[migrate] Connecting to target database [${maskedHost}]...`)
	const migrationsDir = path.join(__dirname, '../migrations')

	if (!fs.existsSync(migrationsDir)) {
		console.error('[migrate] [ERROR] Migrations directory not found:', migrationsDir)
		process.exit(1)
	}

	const files = fs
		.readdirSync(migrationsDir)
		.filter(file => file.endsWith('.sql'))
		.sort()

	if (files.length === 0) {
		console.log('[migrate] [WARN] No SQL migration files found.')
		return
	}

	const client = await pool.connect()
	try {
		// 1. Ensure common schema and schema_migrations tracking ledger table exist
		await client.query('CREATE SCHEMA IF NOT EXISTS common')
		await client.query(`
			CREATE TABLE IF NOT EXISTS common.schema_migrations (
				name VARCHAR(255) PRIMARY KEY,
				executed_at TIMESTAMPTZ DEFAULT NOW()
			)
		`)

		// 2. Fetch list of previously executed migrations
		const executedRes = await client.query('SELECT name FROM common.schema_migrations')
		const executedSet = new Set<string>(executedRes.rows.map(r => r.name))

		let executedCount = 0
		let skippedCount = 0

		// 3. Process migrations sequentially
		for (const file of files) {
			if (executedSet.has(file)) {
				console.log(`[migrate] [SKIP] ${file} (already executed)`)
				skippedCount++
				continue
			}

			const filePath = path.join(migrationsDir, file)
			const sql = fs.readFileSync(filePath, 'utf8')
			console.log(`[migrate] [RUN] Executing migration: ${file}...`)

			try {
				await client.query('BEGIN')
				await client.query(sql)
				await client.query(
					'INSERT INTO common.schema_migrations (name, executed_at) VALUES ($1, NOW())',
					[file],
				)
				await client.query('COMMIT')
				console.log(`[migrate] [DONE] Migration ${file} executed and recorded successfully.`)
				executedCount++
			} catch (err) {
				await client.query('ROLLBACK')
				console.error(`[migrate] [ERROR] Migration ${file} failed:`, err)
				throw err
			}
		}

		console.log(
			`\n[migrate] [SUCCESS] All migrations checked: ${executedCount} executed, ${skippedCount} skipped.\n`,
		)
	} finally {
		client.release()
	}
}

runMigrations()
	.catch(err => {
		console.error('[migrate] [FATAL] Fatal migration error:', err)
		process.exit(1)
	})
	.finally(async () => {
		await pool.end()
	})
