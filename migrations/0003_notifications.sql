-- A saved search a user wants to be notified about
CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),

  listing_type TEXT,
  property_type TEXT,
  family_or_single TEXT,
  city_id INTEGER REFERENCES cities(id),
  area_id INTEGER REFERENCES areas(id),
  min_price REAL,
  max_price REAL,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An actual notification sent to a user
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
