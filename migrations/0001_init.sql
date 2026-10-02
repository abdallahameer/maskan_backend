-- Cities (e.g. الخرطوم, بحري, أم درمان)
CREATE TABLE cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Areas inside a city (e.g. كافوري inside بحري)
CREATE TABLE areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL
);

-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  whatsapp TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Properties (ads)
CREATE TABLE properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SDG',

  listing_type TEXT NOT NULL CHECK (listing_type IN ('rent','sale')),
  property_type TEXT NOT NULL CHECK (property_type IN ('residential','commercial')),
  property_status TEXT NOT NULL CHECK (property_status IN ('ready','underConstruction')),
  family_or_single TEXT CHECK (family_or_single IN ('family','single')),
  payment_type TEXT CHECK (payment_type IN ('monthly','yearly','daily')),

  rooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 0,
  living_room INTEGER NOT NULL DEFAULT 0,
  floor_number INTEGER NOT NULL DEFAULT 0,
  property_age INTEGER NOT NULL DEFAULT 0,
  area_size REAL,

  furnished INTEGER NOT NULL DEFAULT 0,
  kitchen INTEGER NOT NULL DEFAULT 0,
  annex INTEGER NOT NULL DEFAULT 0,
  car_entrance INTEGER NOT NULL DEFAULT 0,
  elevator INTEGER NOT NULL DEFAULT 0,
  air_conditioners INTEGER NOT NULL DEFAULT 0,
  water INTEGER NOT NULL DEFAULT 0,
  roof INTEGER NOT NULL DEFAULT 0,
  electricity INTEGER NOT NULL DEFAULT 0,
  solar_system INTEGER NOT NULL DEFAULT 0,

  city_id INTEGER NOT NULL REFERENCES cities(id),
  area_id INTEGER REFERENCES areas(id),
  address_detail TEXT,
  latitude REAL,
  longitude REAL,

  video_url TEXT,
  views INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Property photos (many per property)
CREATE TABLE property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- Saved / favorited properties
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, property_id)
);

-- Contact us messages
CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Helpful indexes for common lookups
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_city ON properties(city_id);
CREATE INDEX idx_properties_area ON properties(area_id);
CREATE INDEX idx_properties_listing_type ON properties(listing_type);