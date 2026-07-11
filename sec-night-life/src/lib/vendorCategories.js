export const VENDOR_CATEGORIES = [
  { value: 'food_snacks', label: 'Food & snacks' },
  { value: 'equipment_rental', label: 'Equipment rental' },
  { value: 'dj_av', label: 'DJ / AV' },
  { value: 'decor', label: 'Decor' },
  { value: 'photography', label: 'Photography' },
  { value: 'other', label: 'Other' },
];

export function vendorCategoryLabel(value) {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label || value || 'Service';
}
