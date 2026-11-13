PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_reference TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  transaction_id TEXT,
  fulfillment_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  color TEXT,
  size TEXT,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,

  FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_reference
ON orders(order_reference);

CREATE INDEX IF NOT EXISTS idx_orders_transaction
ON orders(transaction_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);