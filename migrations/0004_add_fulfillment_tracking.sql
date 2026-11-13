ALTER TABLE orders
ADD COLUMN fulfillment_provider TEXT;

ALTER TABLE orders
ADD COLUMN fulfillment_order_id TEXT;

ALTER TABLE orders
ADD COLUMN fulfillment_error TEXT;

ALTER TABLE orders
ADD COLUMN fulfillment_attempts INTEGER
NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN fulfilled_at TEXT;

ALTER TABLE orders
ADD COLUMN tracking_number TEXT;

ALTER TABLE orders
ADD COLUMN tracking_url TEXT;

ALTER TABLE orders
ADD COLUMN carrier TEXT;

ALTER TABLE orders
ADD COLUMN shipped_at TEXT;