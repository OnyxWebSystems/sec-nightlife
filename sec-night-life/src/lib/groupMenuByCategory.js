/**
 * Group menu items by full venue category label (category + optional sub_category).
 */
export function formatMenuCategoryLabel(item) {
  if (!item) return 'Other';
  const cat = String(item.category || '').trim();
  const sub = String(item.sub_category || item.subCategory || '').trim();
  if (cat && sub) return `${cat} · ${sub}`;
  return cat || 'Other';
}

export function groupMenuByCategory(items = []) {
  const order = [];
  const map = new Map();
  for (const item of items) {
    const key = formatMenuCategoryLabel(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(item);
  }
  return order.map((category) => ({ category, items: map.get(category) }));
}
