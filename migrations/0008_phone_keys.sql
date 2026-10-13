-- Country calling codes for the contact numbers of an ad (like +249 or +966)
ALTER TABLE properties ADD COLUMN phone_key TEXT;
ALTER TABLE properties ADD COLUMN whatsapp_key TEXT;