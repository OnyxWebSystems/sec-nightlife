import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/client';

export function useMenuCatalogSearch({ q, topCategory, subCategory, enabled = true }) {
  return useQuery({
    queryKey: ['menu-catalog', q, topCategory, subCategory],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (topCategory) params.set('topCategory', topCategory);
      if (subCategory) params.set('subCategory', subCategory);
      params.set('limit', topCategory === 'Drinks' && !q ? '350' : '80');
      return apiGet(`/api/menu-catalog?${params.toString()}`);
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useMenuCatalogSubcategories(topCategory = 'Drinks', enabled = true) {
  return useQuery({
    queryKey: ['menu-catalog-subcategories', topCategory],
    queryFn: () => apiGet(`/api/menu-catalog/subcategories?topCategory=${encodeURIComponent(topCategory)}`),
    enabled: enabled && topCategory === 'Drinks',
    staleTime: 120_000,
  });
}
