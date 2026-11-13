CREATE TABLE IF NOT EXISTS fl_tax_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  zip TEXT NOT NULL,
  house_number TEXT NOT NULL,

  predir TEXT NOT NULL DEFAULT '',
  street_name TEXT NOT NULL,
  street_suffix TEXT NOT NULL DEFAULT '',
  postdir TEXT NOT NULL DEFAULT '',

  city TEXT NOT NULL DEFAULT '',

  county_id TEXT NOT NULL,

  UNIQUE (
    zip,
    house_number,
    predir,
    street_name,
    street_suffix,
    postdir,
    city
  )
);

CREATE INDEX IF NOT EXISTS
idx_fl_tax_address_lookup
ON fl_tax_addresses (
  zip,
  house_number,
  street_name
);


CREATE TABLE IF NOT EXISTS fl_tax_counties (
  county_id TEXT PRIMARY KEY,

  county_name TEXT NOT NULL,

  surtax_rate REAL NOT NULL,

  effective_date TEXT,

  source TEXT NOT NULL DEFAULT
    'Florida Department of Revenue'
);


INSERT OR REPLACE INTO fl_tax_counties (
  county_id,
  county_name,
  surtax_rate,
  effective_date
)
VALUES (
  '101',
  'PASCO',
  0.01,
  '2026-01-01'
);