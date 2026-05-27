import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/** Deprecated: boost checkout is integrated into BusinessPromotions. */
export default function BusinessPromotionBoost() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('BusinessPromotions'), { replace: true });
  }, [navigate]);
  return null;
}
