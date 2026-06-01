import { toast } from 'sonner';

export async function uploadHostedTablePhotoFile(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    toast.error('Please choose an image file');
    return null;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast.error('Image must be 5MB or smaller');
    return null;
  }
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) {
    toast.error('Cloudinary is not configured');
    return null;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', preset);
  formData.append('resource_type', 'image');
  formData.append('folder', 'sec-nightlife/hosted-tables');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || 'Upload failed');
  return { imageUrl: json.secure_url, imagePublicId: json.public_id };
}
