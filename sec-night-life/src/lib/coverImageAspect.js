/** Shared 16:9 aspect for venue/event cover crop and display. */
export const COVER_IMAGE_ASPECT = 16 / 9;

export const COVER_CROP_DIALOG_PROPS = {
  aspect: COVER_IMAGE_ASPECT,
  maxCropHeight: 'min(85vh, 560px)',
  contentClassName: 'max-w-3xl',
};
