/**
 * Unified browser Cloudinary uploads.
 * Prefers unsigned uploads (VITE env or server /api/upload/config) so the frontend
 * cloud name is not overridden by a stale backend signature.
 */
import { API_URL } from '@/config/env';

function getToken() {
  try {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  } catch {
    return null;
  }
}

function apiBase() {
  return (API_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
}

export function readCloudinaryEnvConfig() {
  return {
    cloudName: (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim(),
    uploadPreset: (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim(),
  };
}

let serverConfigCache = null;
let serverConfigPromise = null;

/** Fetch cloud name + unsigned preset from backend (matches CLOUDINARY_* env). */
export async function fetchServerCloudinaryConfig() {
  if (serverConfigCache) return serverConfigCache;
  if (serverConfigPromise) return serverConfigPromise;

  const token = getToken();
  if (!token) return null;

  serverConfigPromise = (async () => {
    try {
      const res = await fetch(`${apiBase()}/api/upload/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const config = {
        cloudName: (data.cloud_name || '').trim(),
        uploadPreset: (data.upload_preset || '').trim(),
      };
      if (config.cloudName && config.uploadPreset) {
        serverConfigCache = config;
        return config;
      }
      return null;
    } catch {
      return null;
    } finally {
      serverConfigPromise = null;
    }
  })();

  return serverConfigPromise;
}

export async function resolveCloudinaryConfig() {
  const env = readCloudinaryEnvConfig();
  if (env.cloudName && env.uploadPreset) return env;
  const server = await fetchServerCloudinaryConfig();
  if (server) return server;
  if (env.cloudName) return env;
  return { cloudName: '', uploadPreset: '' };
}

export function isCloudinaryUploadConfigured(config) {
  return Boolean(config?.cloudName && config?.uploadPreset);
}

function uploadEndpoint(cloudName, resourceType) {
  const rt = resourceType === 'raw' ? 'raw' : resourceType === 'image' ? 'image' : 'auto';
  return `https://api.cloudinary.com/v1_1/${cloudName}/${rt}/upload`;
}

async function unsignedUpload(config, file, options = {}) {
  const {
    resourceType = 'auto',
    folder = null,
    publicId = null,
    filenameOverride = null,
  } = options;

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', config.uploadPreset);
  if (folder) form.append('folder', folder);
  if (publicId) form.append('public_id', publicId);
  if (filenameOverride) form.append('filename_override', filenameOverride);
  if (resourceType !== 'auto') form.append('resource_type', resourceType);

  const res = await fetch(uploadEndpoint(config.cloudName, resourceType), {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Cloudinary upload failed');
  }
  if (!data?.secure_url) throw new Error('Cloudinary returned no secure_url');

  return {
    file_url: data.secure_url,
    secure_url: data.secure_url,
    public_id: data.public_id,
  };
}

async function signedUpload(file, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const sigRes = await fetch(`${apiBase()}/api/upload/signature`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sigRes.ok) throw new Error('Cloudinary is not configured on the server');

  const sig = await sigRes.json();
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.api_key);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder || options.folder || 'sec-nightlife');

  const resourceType = options.resourceType || 'auto';
  const res = await fetch(uploadEndpoint(sig.cloud_name, resourceType), {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed');
  if (!data?.secure_url) throw new Error('Cloudinary returned no secure_url');

  return {
    file_url: data.secure_url,
    secure_url: data.secure_url,
    public_id: data.public_id,
  };
}

async function serverMultipartUpload(file) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase()}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Upload failed');
  return data;
}

/**
 * Upload a file to Cloudinary (or backend fallback).
 * @param {File} file
 * @param {object} [options]
 * @param {'auto'|'image'|'raw'} [options.resourceType]
 * @param {string} [options.folder]
 * @param {string} [options.publicId]
 * @param {string} [options.filenameOverride]
 */
export async function uploadToCloudinary(file, options = {}) {
  const isLikelyLarge = typeof file?.size === 'number' && file.size > 4 * 1024 * 1024;
  const config = await resolveCloudinaryConfig();

  if (isCloudinaryUploadConfigured(config)) {
    return unsignedUpload(config, file, options);
  }

  let signatureAttempted = false;
  const token = getToken();
  if (token) {
    try {
      signatureAttempted = true;
      return await signedUpload(file, options);
    } catch {
      // Fall back to backend upload endpoint.
    }
  }

  if (isLikelyLarge && signatureAttempted) {
    throw new Error(
      'Upload could not start direct Cloudinary transfer. Please refresh and try again, or use a smaller file.'
    );
  }

  return serverMultipartUpload(file);
}
