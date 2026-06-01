/**
 * Group venue menu items by top-level category and sub-category.
 */

function topCategory(item) {
  return String(item?.category || '').trim() || 'Other';
}

function subCategory(item) {
  return String(item?.sub_category || item?.subCategory || '').trim();
}

export function filterMenuBySearch(items = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = [item.name, item.category, item.sub_category, item.subCategory]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/**
 * @returns {{ categories: Array<{ name: string, subcategories: Array<{ name: string, items: object[] }> }> }}
 */
export function buildMenuHierarchy(items = []) {
  const catOrder = [];
  const catMap = new Map();

  for (const item of items) {
    const cat = topCategory(item);
    const sub = subCategory(item);
    if (!catMap.has(cat)) {
      catMap.set(cat, { order: [], map: new Map() });
      catOrder.push(cat);
    }
    const bucket = catMap.get(cat);
    if (sub) {
      if (!bucket.map.has(sub)) {
        bucket.map.set(sub, []);
        bucket.order.push(sub);
      }
      bucket.map.get(sub).push(item);
    }
  }

  const categories = catOrder.map((name) => {
    const bucket = catMap.get(name);
    const categoryItems = items.filter((i) => topCategory(i) === name);
    const subs = bucket.order.map((subName) => ({
      name: subName,
      items: bucket.map.get(subName),
    }));

    if (subs.length > 1 || (subs.length === 1 && subs[0].name !== 'All')) {
      subs.unshift({ name: 'All', items: categoryItems });
    } else if (subs.length === 0) {
      subs.push({ name: 'All', items: categoryItems });
    } else if (subs.length === 1) {
      subs[0] = { name: 'All', items: categoryItems };
    }

    return { name, subcategories: subs };
  });

  return { categories };
}
