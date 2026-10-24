-- Migration: 202610250010_expand_inventory_action_types.sql
-- Description: Expand action_type constraint on shift_inventory_logs to support adjustments and void transactions

ALTER TABLE gasoline.shift_inventory_logs DROP CONSTRAINT IF EXISTS shift_inventory_logs_action_type_check;

ALTER TABLE gasoline.shift_inventory_logs ADD CONSTRAINT shift_inventory_logs_action_type_check CHECK (action_type IN (
    'PURCHASE_JERIGEN',
    'PURCHASE_BOTTLE',
    'POUR_TO_BOTTLE',
    'LOSS_ADJUSTMENT',
    'STOCK_ADJUSTMENT',
    'VOID_PURCHASE',
    'VOID_POUR'
));
