ALTER TABLE orders
ADD COLUMN customer_name TEXT;

ALTER TABLE orders
ADD COLUMN shipping_address1 TEXT;

ALTER TABLE orders
ADD COLUMN shipping_address2 TEXT;

ALTER TABLE orders
ADD COLUMN shipping_city TEXT;

ALTER TABLE orders
ADD COLUMN shipping_state TEXT;

ALTER TABLE orders
ADD COLUMN shipping_postal_code TEXT;

ALTER TABLE orders
ADD COLUMN shipping_country TEXT DEFAULT 'US';

ALTER TABLE orders
ADD COLUMN phone TEXT;