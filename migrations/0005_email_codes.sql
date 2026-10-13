ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_code TEXT;
ALTER TABLE users ADD COLUMN verification_code_expires TEXT;
ALTER TABLE users ADD COLUMN reset_code TEXT;
ALTER TABLE users ADD COLUMN reset_code_expires TEXT;