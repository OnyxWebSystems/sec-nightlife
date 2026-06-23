const UPLOAD_SEGMENT = '/upload/';

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes(UPLOAD_SEGMENT);
}

function hasTransformSegment(segment) {
  return /^(f_|q_|w_|h_|c_|g_|ar_|dpr_)/.test(segment);
}

/**
 * Insert Cloudinary fetch transforms after /upload/ when not already present.
 */
export function cloudinaryTransform(url, transforms) {
  if (!url || !isCloudinaryUrl(url) || !transforms) return url;
  const idx = url.indexOf(UPLOAD_SEGMENT);
  if (idx === -1) return url;
  const prefix = url.slice(0, idx + UPLOAD_SEGMENT.length);
  const rest = url.slice(idx + UPLOAD_SEGMENT.length);
  const firstSegment = rest.split('/')[0] || '';
  if (hasTransformSegment(firstSegment)) return url;
  return `${prefix}${transforms}/${rest}`;
}

export function cloudinaryCardUrl(url) {
  return cloudinaryTransform(url, 'f_auto,q_auto,w_400');
}

export function cloudinaryDetailUrl(url) {
  return cloudinaryTransform(url, 'f_auto,q_auto,w_800');
}
