-- Make city_id optional on properties (an ad can be posted without a city).
-- The city_id / area_id columns stay, so we can use them again later.
-- Existing ads, photos, favorites and notifications are kept (same ids).

-- Rows in other tables point at properties, so park them while the table is
-- swapped, then put them back.
CREATE TABLE property_images_bak AS SELECT * FROM property_images;
CREATE TABLE favorites_bak AS SELECT * FROM favorites;
CREATE TABLE notifications_bak AS SELECT * FROM notifications;
DELETE FROM property_images;
DELETE FROM favorites;
DELETE FROM notifications;

CREATE TABLE properties_new (
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

  city_id INTEGER REFERENCES cities(id),
  area_id INTEGER REFERENCES areas(id),
  address_detail TEXT,
  latitude REAL,
  longitude REAL,

  video_url TEXT,
  views INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  contact_phone TEXT,
  contact_whatsapp TEXT
);

INSERT INTO properties_new (
  id,
  owner_id,
  title,
  description,
  price,
  currency,
  listing_type,
  property_type,
  property_status,
  family_or_single,
  payment_type,
  rooms,
  bathrooms,
  living_room,
  floor_number,
  property_age,
  area_size,
  furnished,
  kitchen,
  annex,
  car_entrance,
  elevator,
  air_conditioners,
  water,
  roof,
  electricity,
  solar_system,
  city_id,
  area_id,
  address_detail,
  latitude,
  longitude,
  video_url,
  views,
  created_at,
  updated_at,
  contact_phone,
  contact_whatsapp
)
SELECT
  id,
  owner_id,
  title,
  description,
  price,
  currency,
  listing_type,
  property_type,
  property_status,
  family_or_single,
  payment_type,
  rooms,
  bathrooms,
  living_room,
  floor_number,
  property_age,
  area_size,
  furnished,
  kitchen,
  annex,
  car_entrance,
  elevator,
  air_conditioners,
  water,
  roof,
  electricity,
  solar_system,
  city_id,
  area_id,
  address_detail,
  latitude,
  longitude,
  video_url,
  views,
  created_at,
  updated_at,
  contact_phone,
  contact_whatsapp
FROM properties;

DROP TABLE properties;
ALTER TABLE properties_new RENAME TO properties;

CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_city ON properties(city_id);
CREATE INDEX idx_properties_area ON properties(area_id);
CREATE INDEX idx_properties_listing_type ON properties(listing_type);

INSERT INTO property_images SELECT * FROM property_images_bak;
INSERT INTO favorites SELECT * FROM favorites_bak;
INSERT INTO notifications SELECT * FROM notifications_bak;
DROP TABLE property_images_bak;
DROP TABLE favorites_bak;
DROP TABLE notifications_bak;