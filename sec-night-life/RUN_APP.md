# How to Run SEC Night Life

## Prerequisites

- Node.js 18+
- PostgreSQL
- npm or yarn

## 1. Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE sec_nightlife;
```

## 2. Backend Setup

```bash
cd sec-night-life/backend
npm install
```

Create `backend/.env` (copy from `.env.example`):

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/sec_nightlife"
JWT_ACCESS_SECRET=your-secret-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
PORT=4000
CORS_ORIGIN=http://localhost:5173
```

Initialize the database:

```bash
npx prisma generate
npx prisma db push
```

Start the backend:

```bash
npm run dev
```

Backend runs at **http://localhost:4000**

## 3. Frontend Setup

```bash
cd sec-night-life
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

The Vite dev server proxies `/api` to the backend automatically.

## 4. First Run

1. Open http://localhost:5173
2. Click **Sign In** or go to `/Login`
3. Click **Sign up** to create an account
4. Register with email and password
5. Complete onboarding or browse as a user

## Optional: Cloudinary (Image Upload)

Add to `backend/.env`:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Without Cloudinary, uploads return base64 data URLs (works for dev).
