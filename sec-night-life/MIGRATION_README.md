# SEC Night Life – Platform Migration Complete

The app has been migrated to a **production-ready Node.js backend** with PostgreSQL, Prisma, and JWT auth.

## Architecture (Option A – Implemented)

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT (access + refresh), bcrypt, role-based access
- **Validation**: Zod
- **Image upload**: Cloudinary (or base64 when not configured)
- **Security**: Helmet, CORS, rate limiting, input validation

## Quick Start

### 1. Backend

```bash
cd sec-night-life/backend
npm install
# Create PostgreSQL DB: createdb sec_nightlife
npx prisma generate
npx prisma db push
npm run dev
```

Backend runs at `http://localhost:4000`.

### 2. Frontend

```bash
cd sec-night-life
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to the backend.

### 3. Environment

- **Backend**: Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, etc.
- **Frontend**: Set `VITE_API_URL` only if the API is on another host (default uses proxy).

## What Was Removed

- Legacy SDK integration
- Legacy Vite plugin
- `base44Client.js`
- Legacy env vars and routing

## What Was Added

- Backend API (`sec-night-life/backend/`)
- Auth: register, login, refresh, logout, forgot/reset password
- API routes: users, venues, events, tables, jobs, upload, blocks, reports, notifications, chats, analytics
- Prisma schema with Users, Venues, Events, Tables, Jobs, Blocks, Reports, Analytics, AuditLogs, etc.
- Frontend API client (`src/api/client.js`)
- Login page (`/Login`)
- Image upload to Cloudinary or base64 fallback

## Database Schema

- **Users** (email, password hash, role, verification)
- **UserProfiles** (username, bio, city, avatar, reputation)
- **Venues** (owner, compliance, ratings)
- **Events** (venue, date, status, images)
- **Tables** (event, host, guests)
- **Jobs** (venue, event, spots)
- **Blocks**, **Reports**, **VenueBlockedUser**
- **AnalyticsEvent**, **AuditLog**

## Next Steps

1. Add FriendRequest, Transaction, Review backend routes if required.
2. Implement Stripe checkout endpoint for `createCheckoutSession`.
3. Configure Cloudinary in production.
4. Set strong secrets in production.
