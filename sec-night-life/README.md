# SEC Nightlife

This project contains everything you need to run the app locally.

## Prerequisites

1. Clone the repository.
2. Navigate to the project directory.
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set environment variables.

```env
VITE_API_URL=http://localhost:4000
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset
```

Notes:
- `VITE_*` variables are injected into the frontend at build time.
- For uploads from the browser (e.g. Venue Onboarding logo/cover), the two Cloudinary `VITE_` vars must be set on the frontend deployment.
- Server-side Cloudinary variables (`CLOUDINARY_*`) are configured in `backend/.env`.

## Run locally

Frontend:

```bash
npm run dev
```

Backend:

```bash
cd backend
npm run dev
```
