/**
 * Shared Cloudinary URL parsing and signed delivery URLs (CVs, compliance docs, etc.).
 */
import { v2 as cloudinary } from 'cloudinary';

/** Hostname pattern: {cloud}-res.cloudinary.com (no cloud name in path). */
function cloudNameFromHost(hostname) {
  const m = /^([^-]+)-res\.cloudinary\.com$/i.exec(hostname);
  return m ? m[1] : null;
}

/**
 * Parse a res.cloudinary.com (or cloud-res) delivery URL into pieces for signing.
 * Supports upload / authenticated / private delivery segments (not only "upload").
 */
export function parseCloudinaryFromUrl(fileUrl) {
  try {
    const u = new URL(fileUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const hostCloud = cloudNameFromHost(u.hostname);

    const deliveryIdx = parts.findIndex((p) => p === 'upload' || p === 'authenticated' || p === 'private');
    if (deliveryIdx < 1) return null;

    const resourceType = parts[deliveryIdx - 1];
    const deliveryToken = parts[deliveryIdx];

    let storageType = 'upload';
    if (deliveryToken === 'authenticated') storageType = 'authenticated';
    else if (deliveryToken === 'private') storageType = 'private';

    /** When path is /{cloud}/raw/upload/... the first segment is the cloud name. */
    const cloudName = hostCloud || (deliveryIdx >= 2 ? parts[0] : null);
    if (!cloudName) return null;

    let publicSegments = parts.slice(deliveryIdx + 1);
    if (publicSegments.length === 0) return null;

    /** Strip short URL signature segment (s--…--) from already-signed delivery URLs before public_id. */
    const first = publicSegments[0];
    if (first && first.startsWith('s--') && first.endsWith('--')) {
      publicSegments = publicSegments.slice(1);
    }
    if (publicSegments.length === 0) return null;

    if (publicSegments[0] && /^v\d+$/.test(publicSegments[0])) {
      publicSegments = publicSegments.slice(1);
    }
    if (publicSegments.length === 0) return null;

    const last = publicSegments[publicSegments.length - 1];
    const dotIdx = last.lastIndexOf('.');
    const format = dotIdx > -1 ? last.slice(dotIdx + 1) : null;
    const lastNoExt = dotIdx > -1 ? last.slice(0, dotIdx) : last;

    const publicIdPrefix = publicSegments.length > 1
      ? publicSegments.slice(0, -1).join('/')
      : '';

    const publicId = publicIdPrefix ? `${publicIdPrefix}/${lastNoExt}` : lastNoExt;
    const fullPublicId = publicSegments.join('/');

    return { resourceType, publicId, format, fullPublicId, storageType, cloudName };
  } catch {
    return null;
  }
}

let cloudinaryConfigured = false;
function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return true;
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return false;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  cloudinaryConfigured = true;
  return true;
}

/**
 * Signed delivery URL (s--…-- in path). Use for public, authenticated, or private assets.
 * For raw PDFs stored as authenticated/restricted, the stored secure_url often contains
 * `/raw/authenticated/` — callers must not assume `/raw/upload/` only (see parseCloudinaryFromUrl).
 */
export function signCloudinaryUrl(fileUrl) {
  const parsed = parseCloudinaryFromUrl(fileUrl);
  if (!parsed) return null;
  if (!ensureCloudinaryConfigured()) return null;

  const { resourceType, publicId, format, fullPublicId, storageType, cloudName } = parsed;
  const envCloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (cloudName && envCloud && cloudName !== envCloud) {
    console.warn(
      `[cloudinarySignedUrl] URL cloud name "${cloudName}" differs from CLOUDINARY_CLOUD_NAME "${envCloud}". Signing uses the URL's cloud name; fix env or stored URL if delivery still fails.`
    );
  }

  const baseOpts = {
    secure: true,
    sign_url: true,
    type: storageType,
    cloud_name: cloudName || envCloud,
  };

  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.url(fullPublicId, {
      ...baseOpts,
      resource_type: 'raw',
      long_url_signature: true,
    });
  }

  return cloudinary.url(publicId, {
    ...baseOpts,
    resource_type: resourceType,
    format: format || undefined,
  });
}

export function privateDownloadUrl(fileUrl) {
  const parsed = parseCloudinaryFromUrl(fileUrl);
  if (!parsed) return null;
  if (!ensureCloudinaryConfigured()) return null;

  const { resourceType, publicId, format, fullPublicId, storageType, cloudName } = parsed;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 30;

  const downloadOpts = {
    resource_type: resourceType,
    type: storageType,
    expires_at: expiresAtSeconds,
    attachment: false,
    cloud_name: cloudName || process.env.CLOUDINARY_CLOUD_NAME,
  };

  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.utils.private_download_url(fullPublicId, null, downloadOpts);
  }

  if (!format) return null;

  return cloudinary.utils.private_download_url(publicId, format, downloadOpts);
}
