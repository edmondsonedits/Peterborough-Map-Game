CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('city-ten', 'random')),
  station_id TEXT NOT NULL CHECK (station_id IN ('station-1', 'station-2', 'station-3')),
  location_ids_json TEXT NOT NULL,
  game_version TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  result_id TEXT UNIQUE
);
CREATE TABLE results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  player_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  station_id TEXT NOT NULL,
  raw_elapsed_ms INTEGER NOT NULL CHECK (raw_elapsed_ms >= 0),
  penalty_ms INTEGER NOT NULL CHECK (penalty_ms >= 0),
  verified_total_ms INTEGER NOT NULL CHECK (verified_total_ms >= 0),
  round_count INTEGER NOT NULL CHECK (round_count BETWEEN 1 AND 10),
  game_version TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'pending', 'hidden'))
);
CREATE INDEX results_leaderboard_idx ON results(mode, station_id, moderation_status, verified_total_ms, penalty_ms, completed_at_ms);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_started_ms INTEGER NOT NULL, request_count INTEGER NOT NULL);
CREATE TABLE audit_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, session_id TEXT, result_id TEXT, metadata_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL);
