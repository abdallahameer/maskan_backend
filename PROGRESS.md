# Maskan Backend — Progress

## Stage 1: Foundation

- [x] Cloudflare account + Wrangler set up
- [x] Development database created (maskan-db-dev)
- [x] Database tables created (users, properties, images, favorites, etc.)
- [x] Cities & areas seeded (starter list, Abdallah to expand later)

## Stage 2: Authentication

- [x] Signup (name, phone, whatsapp, password)
- [x] Login (phone + password)
- [x] Password hashing (secure, one-way)
- [x] JWT tokens (1-year expiry, stay logged in until logout)
- [x] /auth/me (get current user)

## Stage 3: Properties

- [x] Create property
- [x] List properties with filters
- [x] Get single property (+ view counter)
- [x] Edit property (owner only)
- [x] Delete property (owner only)
- [x] "My ads" list (owner's own properties)

## Stage 4: Photos & video

- [x] R2 bucket setup (file storage)
- [x] Upload photos for a property
- [x] Upload one video for a property
- [x] Delete a photo

## Stage 5: Favorites (saved)

- [x] Save/unsave a property
- [x] List user's saved properties

## Stage 6: Search & location

- [x] Text/address search
- [x] Map search (properties within a location)
- [ ] More cities/areas (ongoing, as Abdallah provides names)

## Stage 7: Notifications

- [x] In-app notifications (new property matches saved filters)
- [ ] Push notifications (later, needs FCM setup)

## Stage 8: Contact & profile

- [ ] Contact us form (paused — waiting on Hostinger email setup)
- [x] Edit profile
- [x] Delete account

## Stage 9: Production

- [x] Create production database (separate from dev)
- [x] Create production Worker
- [x] Move approved changes from dev to production
- [x] R2 real file upload verified
- [ ] Custom domain (when purchased)

## Stage 10: Connect to frontend

- [ ] Replace mock data screen by screen
- [ ] Real login/signup screens
- [ ] Real property list/search
- [ ] Real upload flow
- [ ] Real favorites/notifications
