import React from 'react';
import ImageCropDialog from './ImageCropDialog';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string | null} props.imageSrc
 * @param {(file: File) => void} props.onCropped
 */
export default function AvatarCropDialog({ open, onOpenChange, imageSrc, onCropped }) {
  return (
    <ImageCropDialog
      open={open}
      onOpenChange={onOpenChange}
      imageSrc={imageSrc}
      onCropped={onCropped}
      aspect={1}
      cropShape="round"
      title="Adjust profile photo"
      outputFileName="avatar.jpg"
    />
  );
}
