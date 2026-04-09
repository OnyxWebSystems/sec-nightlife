---
name: cloudinary-secure-preview
description: Implement secure preview/download for Cloudinary-hosted PDFs, images, and documents in this project. Use when users report blank previews, 401 errors, signed URL failures, or when adding new "View file" features for compliance docs, CVs, IDs, or media behind access controls.
---

# Cloudinary Secure Preview

## Goal
Serve file previews through backend-generated Cloudinary URLs so restricted assets can be viewed without exposing private credentials and without client-side URL rewriting.

## Use This Skill When
- A user sees `401 Unauthorized`, `deny or ACL failure`, or blank preview for Cloudinary files.
- A feature needs "View PDF", "View CV", or "Open in new tab" behavior.
- Assets may be `raw`, `image`, `upload`, `authenticated`, or `private`.

## Project Sources of Truth
- URL helpers: `sec-night-life/backend/src/lib/cloudinarySignedUrl.js`
- Compliance route pattern: `sec-night-life/backend/src/routes/compliance-documents.js`
- Jobs/CV route pattern: `sec-night-life/backend/src/routes/jobs.js`

## Required Backend Env Vars
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Do not hardcode any of these values.

## Implementation Pattern

1. Parse the stored Cloudinary URL server-side.
2. Generate preview URL server-side:
   - Prefer `privateDownloadUrl(fileUrl)` first.
   - Fallback to `signCloudinaryUrl(fileUrl)`.
   - Last fallback: raw stored URL.
3. Return `viewUrl` in API JSON.
4. Frontend opens only `viewUrl` (fallback to raw URL only if API has no signed/download URL).

Recommended ordering:

```js
const viewUrl = fileUrl
  ? (privateDownloadUrl(fileUrl) || signCloudinaryUrl(fileUrl) || fileUrl)
  : null;
```

## Cloudinary Rules That Prevent 401s

- Match delivery `type` with how the file was stored (`upload`, `authenticated`, or `private`).
- For `raw` assets, preserve full public ID when needed (including extension in API download path handling).
- Never mutate signed URLs on the frontend (adding params can invalidate signatures).
- Never trust client-side conversion like replacing `/image/upload/` with `/raw/upload/`.

## Frontend Pattern

- Call backend endpoint (authorized) to fetch file access metadata.
- Use:
  - `data.viewUrl || data.downloadUrl || data.signedFileUrl || data.fileUrl`
- Open in new tab or iframe with the backend-provided URL only.

## Debug Checklist

1. Inspect API response that powers the button:
   - Confirm `viewUrl` exists.
   - Confirm expected host:
     - Often `api.cloudinary.com/.../download?...` for restricted files.
2. If still failing, inspect Cloudinary URL source:
   - Resource type (`raw` vs `image`)
   - Delivery type (`upload` vs `authenticated` vs `private`)
   - Public ID correctness
3. Confirm backend env vars are present in deployed environment.
4. Retest same document in:
   - in-app preview
   - open in new tab

## Security and Access

- Enforce access checks before returning `viewUrl` (owner/admin/reviewer guards).
- Do not expose Cloudinary secrets to client code.
- Add audit logging for sensitive document access where applicable.

## Done Criteria

- "View" button opens document without 401.
- Endpoint returns a valid server-generated URL for restricted assets.
- Works for both PDFs and images/files using the same backend strategy.
