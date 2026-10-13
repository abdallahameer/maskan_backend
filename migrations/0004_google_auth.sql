-- Clear out test data that references the old users table
DELETE FROM property_images;
DELETE FROM favorites;
DELETE FROM notifications;
DELETE FROM saved_searches;
DELETE FROM properties;

-- Now it's safe to rebuild users
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add per-ad contact numbers
ALTER TABLE properties ADD COLUMN contact_phone TEXT;
ALTER TABLE properties ADD COLUMN contact_whatsapp TEXT;