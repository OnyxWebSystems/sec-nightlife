import { useState, useCallback, useRef } from 'react';

/**
 * File picker → crop dialog → onCropped(file).
 * @param {{ onCropped: (file: File) => void | Promise<void> }} options
 */
export function useImageCropUpload({ onCropped }) {
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const revokeRef = useRef(null);

  const revokeCropSrc = useCallback(() => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setCropSrc(null);
  }, []);

  const onPickFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      revokeCropSrc();
      const url = URL.createObjectURL(file);
      revokeRef.current = url;
      setCropSrc(url);
      setCropOpen(true);
    },
    [revokeCropSrc]
  );

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) onPickFile(file);
      e.target.value = '';
    },
    [onPickFile]
  );

  const handleCropped = useCallback(
    async (file) => {
      revokeCropSrc();
      await onCropped(file);
    },
    [onCropped, revokeCropSrc]
  );

  const onCropOpenChange = useCallback(
    (open) => {
      setCropOpen(open);
      if (!open) revokeCropSrc();
    },
    [revokeCropSrc]
  );

  return {
    cropOpen,
    cropSrc,
    onPickFile,
    handleInputChange,
    handleCropped,
    onCropOpenChange,
  };
}
