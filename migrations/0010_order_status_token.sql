ALTER TABLE orders
ADD COLUMN customer_status_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS
idx_orders_customer_status_token
ON orders(customer_status_token);