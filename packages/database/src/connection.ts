import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

declare global {
	// eslint-disable-next-line no-var
	var pgPool: Pool | undefined
}

function getInitialConnectionString(): string {
	const rawUrl =
		process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL || process.env.STAGING_DATABASE_URL
	if (rawUrl) return rawUrl
	throw new Error(
		'Database connection string is not configured. Set DATABASE_URL, LOCAL_DATABASE_URL, or STAGING_DATABASE_URL.',
	)
}

let currentConnectionString = getInitialConnectionString()
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

function createPool(connStr: string): Pool {
	return new Pool({
		connectionString: connStr,
		max: isServerless ? 3 : 10,
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 15000,
		ssl:
			connStr.includes('supabase') ||
			process.env.NODE_ENV === 'production' ||
			(process.env.NODE_ENV as string) === 'staging'
				? { rejectUnauthorized: false }
				: undefined,
	})
}

export let pool: Pool = global.pgPool || createPool(currentConnectionString)

if ((process.env.NODE_ENV as string) !== 'staging') {
	global.pgPool = pool
}

/**
 * Execute a parameterized Raw SQL query against the connection pool.
 * Features automatic fallback from unreachable Local Database to Staging Database.
 */
export async function query<T extends QueryResultRow = any>(
	text: string,
	params?: any[],
): Promise<QueryResult<T>> {
	const start = Date.now()
	try {
		const res = await pool.query<T>(text, params)
		const duration = Date.now() - start
		if (process.env.NODE_ENV === 'development') {
			console.log('Executed query', {
				text: text.trim().replace(/\s+/g, ' '),
				duration,
				rows: res.rowCount,
			})
		}
		return res
	} catch (error: any) {
		const isLocalhost =
			currentConnectionString.includes('localhost') || currentConnectionString.includes('127.0.0.1')
		const stagingUrl = process.env.STAGING_DATABASE_URL

		if (
			isLocalhost &&
			stagingUrl &&
			(error?.code === 'ECONNREFUSED' || error?.message?.includes('connect ECONNREFUSED'))
		) {
			console.warn(
				'Local PostgreSQL database not accessible on localhost. Automatically switching connection to Staging DB (Supabase)...',
			)
			currentConnectionString = stagingUrl
			pool = createPool(currentConnectionString)
			global.pgPool = pool

			const res = await pool.query<T>(text, params)
			return res
		}

		console.error('Database query error:', { text, params, error })
		throw error
	}
}

/**
 * Execute a batch of SQL statements within a single atomic database transaction.
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
	let client: PoolClient
	try {
		client = await pool.connect()
	} catch (error: any) {
		const isLocalhost =
			currentConnectionString.includes('localhost') || currentConnectionString.includes('127.0.0.1')
		const stagingUrl = process.env.STAGING_DATABASE_URL

		if (
			isLocalhost &&
			stagingUrl &&
			(error?.code === 'ECONNREFUSED' || error?.message?.includes('connect ECONNREFUSED'))
		) {
			console.warn(
				'Local PostgreSQL database not accessible on localhost. Automatically switching connection to Staging DB (Supabase)...',
			)
			currentConnectionString = stagingUrl
			pool = createPool(currentConnectionString)
			global.pgPool = pool
			client = await pool.connect()
		} else {
			throw error
		}
	}

	try {
		await client.query('BEGIN')
		const result = await callback(client)
		await client.query('COMMIT')
		return result
	} catch (error) {
		await client.query('ROLLBACK')
		console.error('Database transaction rolled back due to error:', error)
		throw error
	} finally {
		client.release()
	}
}
