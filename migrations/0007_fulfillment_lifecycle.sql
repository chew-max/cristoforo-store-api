ALTER TABLE orders
ADD COLUMN fulfillment_provider_status TEXT;

ALTER TABLE orders
ADD COLUMN fulfillment_reconciled_at TEXT;

ALTER TABLE orders
ADD COLUMN fulfillment_last_event_id TEXT;

ALTER TABLE orders
ADD COLUMN delivered_at TEXT;