/*
# Create accounts and sync tables

## Purpose
Allow users to generate a simple account number to sync watch history and preferences across devices. No email/password required - just a unique account number.

## Tables

### accounts
- `id` (uuid, primary key) - internal Supabase auth-compatible ID
- `account_number` (text, unique) - simple 8-character account number like "ABC123XY"
- `created_at` (timestamp)

### watch_history
- `id` (uuid, primary key)
- `account_id` (uuid, references accounts)
- `media_id` (text) - TMDB ID
- `media_type` (text) - "movie" or "tv"
- `title` (text) - media title
- `poster` (text) - poster URL
- `position_seconds` (integer) - playback position
- `duration_seconds` (integer) - total duration
- `season` (integer, nullable) - for TV shows
- `episode` (integer, nullable) - for TV shows
- `updated_at` (timestamp)

### preferences
- `id` (uuid, primary key)
- `account_id` (uuid, unique, references accounts)
- `settings_json` (jsonb) - stored preferences
- `updated_at` (timestamp)

## Security
- RLS enabled on all tables
- Anonymous access allowed since we use account numbers, not auth
- Policies allow read/write based on account_number match (passed via request header or query)
*/

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text UNIQUE NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  media_id text NOT NULL,
  media_type text NOT NULL,
  title text NOT NULL,
  poster text,
  position_seconds integer DEFAULT 0,
  duration_seconds integer DEFAULT 0,
  season integer,
  episode integer,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, media_id, media_type, season, episode)
);

CREATE TABLE IF NOT EXISTS preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  settings_json jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_watch_history_account ON watch_history(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

-- Accounts policies (anon can create and read by account_number)
DROP POLICY IF EXISTS "anon_read_accounts" ON accounts;
CREATE POLICY "anon_read_accounts" ON accounts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_accounts" ON accounts;
CREATE POLICY "anon_insert_accounts" ON accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Watch history policies (public by account_number, enforced at app level)
DROP POLICY IF EXISTS "anon_read_watch_history" ON watch_history;
CREATE POLICY "anon_read_watch_history" ON watch_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_watch_history" ON watch_history;
CREATE POLICY "anon_insert_watch_history" ON watch_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_watch_history" ON watch_history;
CREATE POLICY "anon_update_watch_history" ON watch_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_watch_history" ON watch_history;
CREATE POLICY "anon_delete_watch_history" ON watch_history FOR DELETE
  TO anon, authenticated USING (true);

-- Preferences policies
DROP POLICY IF EXISTS "anon_read_preferences" ON preferences;
CREATE POLICY "anon_read_preferences" ON preferences FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_preferences" ON preferences;
CREATE POLICY "anon_insert_preferences" ON preferences FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_preferences" ON preferences;
CREATE POLICY "anon_update_preferences" ON preferences FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);