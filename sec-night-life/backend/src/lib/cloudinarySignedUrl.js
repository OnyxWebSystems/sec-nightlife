/**
 * Shared Cloudinary URL parsing and signed delivery URLs (CVs, compliance docs, etc.).
 */
import { v2 as cloudinary } from 'cloudinary';

export function parseCloudinaryFromUrl(fileUrl) {
  try {
    const u = new URL(fileUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx < 2) return null;

    const resourceType = parts[uploadIdx - 1];
    const versionPart = parts[uploadIdx + 1];
    void versionPart;

    const publicSegments = parts.slice(uploadIdx + 2);
    if (!resourceType || publicSegments.length === 0) return null;

    const last = publicSegments[publicSegments.length - 1];
    const dotIdx = last.lastIndexOf('.');
    const format = dotIdx > -1 ? last.slice(dotIdx + 1) : null;
    const lastNoExt = dotIdx > -1 ? last.slice(0, dotIdx) : last;

    const publicIdPrefix = publicSegments.length > 1
      ? publicSegments.slice(0, -1).join('/')
      : '';

    const publicId = publicIdPrefix ? `${publicIdPrefix}/${lastNoExt}` : lastNoExt;
    const fullPublicId = publicSegments.join('/');

    return { resourceType, publicId, format, fullPublicId };
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

export function signCloudinaryUrl(fileUrl) {
  const parsed = parseCloudinaryFromUrl(fileUrl);
  if (!parsed) return null;
  if (!ensureCloudinaryConfigured()) return null;

  const { resourceType, publicId, format, fullPublicId } = parsed;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 30;

  const baseOpts = {
    secure: true,
    sign_url: true,
    expires_at: expiresAtSeconds,
    type: 'upload',
  };

  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.url(fullPublicId, {
      ...baseOpts,
      resource_type: 'raw',
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

  const { resourceType, publicId, format, fullPublicId } = parsed;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 30;

  const downloadOpts = {
    resource_type: resourceType,
    type: 'upload',
    expires_at: expiresAtSeconds,
    attachment: false,
  };

  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.utils.private_download_url(fullPublicId, null, downloadOpts);
  }

  if (!format) return null;

  return cloudinary.utils.private_download_url(publicId, format, downloadOpts);
}
