CREATE TABLE order_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_id INTEGER NOT NULL,

  type TEXT NOT NULL,

  provider TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING',

  provider_message_id TEXT,

  attempts INTEGER NOT NULL DEFAULT 0,

  last_error TEXT,

  sent_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE CASCADE,

  UNIQUE (order_id, type)
);

CREATE INDEX idx_order_notifications_order_id
  ON order_notifications(order_id);

CREATE INDEX idx_order_notifications_status
  ON order_notifications(status);