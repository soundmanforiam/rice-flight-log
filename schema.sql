-- Rice Flight Log — D1 schema
-- Run with: npm run db:migrate:local   (or db:migrate:remote)

DROP TABLE IF EXISTS flights;

CREATE TABLE flights (
  id             TEXT PRIMARY KEY,        -- e.g. f01, f02, ... (kept stable across imports)
  date           TEXT,                    -- as written in the logbook, e.g. "4/9/02" or "(page)"
  year           INTEGER,                 -- parsed year, for sorting/filtering
  aircraft       TEXT,                    -- make & model, e.g. "C-550"
  ident          TEXT,                    -- aircraft identifier / tail number
  from_airport   TEXT,                    -- "from" is a reserved-ish word in some contexts; use from_airport
  to_airport     TEXT,
  duration       REAL,                    -- total hours, decimal
  day_landings   INTEGER DEFAULT 0,
  night_landings INTEGER DEFAULT 0,
  source         TEXT,                    -- source photo filename, e.g. "IMG_0251"
  logbook        TEXT,                    -- which physical logbook, e.g. "1"
  remarks        TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_flights_year     ON flights(year);
CREATE INDEX idx_flights_aircraft ON flights(aircraft);
CREATE INDEX idx_flights_source   ON flights(source);
