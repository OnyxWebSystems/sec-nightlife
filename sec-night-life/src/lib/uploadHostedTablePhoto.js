import { toast } from 'sonner';
import { uploadToCloudinary } from '@/lib/cloudinaryUpload';

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
  const result = await uploadToCloudinary(file, {
    resourceType: 'image',
    folder: 'sec-nightlife/hosted-tables',
  });
  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}
