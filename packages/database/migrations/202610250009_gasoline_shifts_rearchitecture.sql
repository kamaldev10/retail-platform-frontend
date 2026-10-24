-- Migration: 202610250009_gasoline_shifts_rearchitecture.sql
-- Description: Unify shifts, live stock, and recaps into robust audited tables with NUMERIC precision, comprehensive indexing, and zero-error cash reconciliation

-- 1. Create Master Sesi Shift & Laci Kasir (gasoline.shifts)
CREATE TABLE IF NOT EXISTS gasoline.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL,
    shift_number INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'AUDITED')),

    -- Rekonsiliasi Kas Laci Fisik (Uang Tunai)
    opening_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_sales_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_cash_out NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    expected_closing_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    actual_closing_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cash_variance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    -- Finansial Penjualan Shift
    total_sold_liters NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    total_cogs NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_net_profit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    -- Pengeluaran Kas Operasional dari Laci Kasir
    fuel_purchase_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    salary_expenses NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    other_expenses NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    -- Inventaris Fisik Jerigen Bulk (Realtime saat OPEN, Snapshot saat CLOSED)
    opening_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    purchased_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    poured_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    current_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    closing_jerigen NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    jerigen_loss NUMERIC(12, 3) NOT NULL DEFAULT 0.000,

    variance_note TEXT,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_gasoline_shifts_date_num UNIQUE (shift_date, shift_number)
);

-- Indeks B-Tree untuk performa query cepat pada gasoline.shifts
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_date ON gasoline.shifts(shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_status ON gasoline.shifts(status);
CREATE INDEX IF NOT EXISTS idx_gasoline_shifts_opened_at ON gasoline.shifts(opened_at DESC);

-- 2. Create Rincian Opname Botol Per Shift (gasoline.shift_product_items)
CREATE TABLE IF NOT EXISTS gasoline.shift_product_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES gasoline.shifts(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL REFERENCES gasoline.products(id),

    opening_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    pushed_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    current_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    closing_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    sold_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,

    unit_selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    unit_cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cogs NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_gasoline_shift_product_item UNIQUE (shift_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_gasoline_shift_items_shift_id ON gasoline.shift_product_items(shift_id);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_items_product_id ON gasoline.shift_product_items(product_id);

-- 3. Create Buku Pengeluaran Kas Shift (gasoline.shift_expenses)
CREATE TABLE IF NOT EXISTS gasoline.shift_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES gasoline.shifts(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL CHECK (category IN (
        'FUEL_PURCHASE',
        'SALARY_PAYMENT',
        'OPERATIONAL',
        'OWNER_DRAW',
        'OTHER'
    )),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    payment_source VARCHAR(30) NOT NULL DEFAULT 'CASH_DRAWER' CHECK (payment_source IN (
        'CASH_DRAWER',
        'EXTERNAL_TRANSFER',
        'OWNER_POCKET'
    )),
    recipient VARCHAR(100),
    description TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasoline_shift_expenses_shift_id ON gasoline.shift_expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_expenses_category ON gasoline.shift_expenses(category);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_expenses_source ON gasoline.shift_expenses(payment_source);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_expenses_created_at ON gasoline.shift_expenses(created_at DESC);

-- 4. Create Buku Mutasi Fisik Bensin (gasoline.shift_inventory_logs)
CREATE TABLE IF NOT EXISTS gasoline.shift_inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES gasoline.shifts(id) ON DELETE CASCADE,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN (
        'PURCHASE_JERIGEN',
        'PURCHASE_BOTTLE',
        'POUR_TO_BOTTLE',
        'LOSS_ADJUSTMENT'
    )),
    product_id VARCHAR(50) REFERENCES gasoline.products(id),
    liters NUMERIC(12, 3) NOT NULL,
    bottles_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    expense_id UUID REFERENCES gasoline.shift_expenses(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasoline_shift_inv_shift_id ON gasoline.shift_inventory_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_inv_action ON gasoline.shift_inventory_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_inv_product_id ON gasoline.shift_inventory_logs(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gasoline_shift_inv_created_at ON gasoline.shift_inventory_logs(created_at DESC);

-- 5. Perbarui gasoline.salary_payments dengan payment_source dan shift_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gasoline' AND table_name='salary_payments' AND column_name='payment_source'
    ) THEN
        ALTER TABLE gasoline.salary_payments
        ADD COLUMN payment_source VARCHAR(30) NOT NULL DEFAULT 'CASH_DRAWER'
        CHECK (payment_source IN ('CASH_DRAWER', 'BANK_TRANSFER', 'OWNER_POCKET'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gasoline' AND table_name='salary_payments' AND column_name='shift_id'
    ) THEN
        ALTER TABLE gasoline.salary_payments
        ADD COLUMN shift_id UUID REFERENCES gasoline.shifts(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gasoline_salary_shift_id ON gasoline.salary_payments(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gasoline_salary_source ON gasoline.salary_payments(payment_source);

-- 6. Perbarui gasoline.finances dengan tautan shift_id, expense_id, inventory_log_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gasoline' AND table_name='finances' AND column_name='shift_id'
    ) THEN
        ALTER TABLE gasoline.finances
        ADD COLUMN shift_id UUID REFERENCES gasoline.shifts(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gasoline' AND table_name='finances' AND column_name='expense_id'
    ) THEN
        ALTER TABLE gasoline.finances
        ADD COLUMN expense_id UUID REFERENCES gasoline.shift_expenses(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gasoline' AND table_name='finances' AND column_name='inventory_log_id'
    ) THEN
        ALTER TABLE gasoline.finances
        ADD COLUMN inventory_log_id UUID REFERENCES gasoline.shift_inventory_logs(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gasoline_finances_shift_id ON gasoline.finances(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gasoline_finances_expense_id ON gasoline.finances(expense_id) WHERE expense_id IS NOT NULL;

-- 7. Migrasi Data Historis Idempoten

-- 7a. Migrasi gasoline.recaps ke gasoline.shifts
INSERT INTO gasoline.shifts (
    id,
    shift_date,
    shift_number,
    status,
    opening_cash,
    total_sales_revenue,
    total_cash_out,
    expected_closing_cash,
    actual_closing_cash,
    cash_variance,
    total_sold_liters,
    total_cogs,
    total_net_profit,
    fuel_purchase_cost,
    salary_expenses,
    other_expenses,
    opening_jerigen,
    purchased_jerigen,
    poured_jerigen,
    current_jerigen,
    closing_jerigen,
    jerigen_loss,
    variance_note,
    opened_at,
    closed_at,
    created_at,
    updated_at
)
SELECT
    r.id,
    TO_DATE(r.date, 'YYYY-MM-DD') AS shift_date,
    1 AS shift_number,
    'CLOSED' AS status,
    COALESCE(r.initial_cash_balance, 0)::NUMERIC(15, 2) AS opening_cash,
    COALESCE(r.total_revenue, 0)::NUMERIC(15, 2) AS total_sales_revenue,
    COALESCE(r.fuel_purchase_cost, 0)::NUMERIC(15, 2) AS total_cash_out,
    (COALESCE(r.initial_cash_balance, 0) + COALESCE(r.total_revenue, 0) - COALESCE(r.fuel_purchase_cost, 0))::NUMERIC(15, 2) AS expected_closing_cash,
    COALESCE(r.cash_in, 0)::NUMERIC(15, 2) AS actual_closing_cash,
    (COALESCE(r.cash_in, 0) - (COALESCE(r.initial_cash_balance, 0) + COALESCE(r.total_revenue, 0) - COALESCE(r.fuel_purchase_cost, 0)))::NUMERIC(15, 2) AS cash_variance,
    COALESCE(r.total_sold_liters, 0)::NUMERIC(12, 3) AS total_sold_liters,
    COALESCE(r.total_capital, 0)::NUMERIC(15, 2) AS total_cogs,
    COALESCE(r.total_net_profit, 0)::NUMERIC(15, 2) AS total_net_profit,
    COALESCE(r.fuel_purchase_cost, 0)::NUMERIC(15, 2) AS fuel_purchase_cost,
    0.00 AS salary_expenses,
    0.00 AS other_expenses,
    0.000 AS opening_jerigen,
    0.000 AS purchased_jerigen,
    0.000 AS poured_jerigen,
    0.000 AS current_jerigen,
    0.000 AS closing_jerigen,
    0.000 AS jerigen_loss,
    r.note AS variance_note,
    r.created_at AS opened_at,
    r.updated_at AS closed_at,
    r.created_at,
    r.updated_at
FROM gasoline.recaps r
ON CONFLICT (shift_date, shift_number) DO NOTHING;

-- 7b. Migrasi gasoline.product_recaps ke gasoline.shift_product_items
INSERT INTO gasoline.shift_product_items (
    id,
    shift_id,
    product_id,
    opening_qty,
    pushed_qty,
    current_qty,
    closing_qty,
    sold_qty,
    unit_selling_price,
    unit_cost_price,
    revenue,
    cogs,
    profit,
    created_at,
    updated_at
)
SELECT
    pr.id,
    pr.recap_id AS shift_id,
    pr.product_id,
    pr.opening_stock::NUMERIC(12, 3) AS opening_qty,
    0.000 AS pushed_qty,
    pr.closing_stock::NUMERIC(12, 3) AS current_qty,
    pr.closing_stock::NUMERIC(12, 3) AS closing_qty,
    pr.sold_qty::NUMERIC(12, 3) AS sold_qty,
    CASE WHEN pr.sold_qty > 0 THEN (pr.revenue / pr.sold_qty)::NUMERIC(15, 2) ELSE 0.00 END AS unit_selling_price,
    CASE WHEN pr.sold_qty > 0 THEN (pr.capital / pr.sold_qty)::NUMERIC(15, 2) ELSE 0.00 END AS unit_cost_price,
    pr.revenue::NUMERIC(15, 2) AS revenue,
    pr.capital::NUMERIC(15, 2) AS cogs,
    pr.profit::NUMERIC(15, 2) AS profit,
    NOW(),
    NOW()
FROM gasoline.product_recaps pr
JOIN gasoline.shifts s ON s.id = pr.recap_id
ON CONFLICT (shift_id, product_id) DO NOTHING;

-- 7c. Tautkan shift_id pada gasoline.salary_payments yang sudah ada
UPDATE gasoline.salary_payments sp
SET shift_id = s.id
FROM gasoline.shifts s
WHERE sp.shift_id IS NULL
  AND TO_DATE(sp.date, 'YYYY-MM-DD') = s.shift_date;

-- 7d. Tautkan shift_id pada gasoline.finances yang sudah ada
UPDATE gasoline.finances f
SET shift_id = f.recap_id
WHERE f.shift_id IS NULL AND f.recap_id IS NOT NULL;
