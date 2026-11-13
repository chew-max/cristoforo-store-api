CREATE TABLE IF NOT EXISTS fulfillment_webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, event_id TEXT NOT NULL, event_type TEXT, order_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider, event_id), FOREIGN KEY (order_id) REFERENCES orders(id));

CREATE INDEX IF NOT EXISTS idx_fulfillment_webhook_events_order_id ON fulfillment_webhook_events(order_id);
