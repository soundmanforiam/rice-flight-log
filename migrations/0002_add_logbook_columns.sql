-- Rice Flight Log: extra logbook columns for Books LB1-LB3 (Jeppesen + AOPA logbooks).
-- Hours are decimal; NULL means the column was blank in the logbook.
ALTER TABLE flights ADD COLUMN single_engine REAL;
ALTER TABLE flights ADD COLUMN multi_engine REAL;
ALTER TABLE flights ADD COLUMN jet REAL;
ALTER TABLE flights ADD COLUMN rotorcraft REAL;
ALTER TABLE flights ADD COLUMN glider REAL;
ALTER TABLE flights ADD COLUMN retract REAL;
ALTER TABLE flights ADD COLUMN night_time REAL;
ALTER TABLE flights ADD COLUMN actual_instrument REAL;
ALTER TABLE flights ADD COLUMN simulated_instrument REAL;
ALTER TABLE flights ADD COLUMN sim_trainer REAL;
ALTER TABLE flights ADD COLUMN approaches INTEGER;
ALTER TABLE flights ADD COLUMN approach_types TEXT;
ALTER TABLE flights ADD COLUMN cross_country REAL;
ALTER TABLE flights ADD COLUMN pic REAL;
ALTER TABLE flights ADD COLUMN sic REAL;
ALTER TABLE flights ADD COLUMN dual_received REAL;
ALTER TABLE flights ADD COLUMN solo REAL;
ALTER TABLE flights ADD COLUMN ground_instruction REAL;
CREATE INDEX IF NOT EXISTS idx_flights_logbook ON flights(logbook);
