import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/** Bookmarks and old links redirect to Host Dashboard table flow. */
export default function CreateTable() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const event = params.get('event');
    const q = event
      ? `?create=table&event=${encodeURIComponent(event)}`
      : '?create=table';
    navigate(`${createPageUrl('HostDashboard')}${q}`, { replace: true });
  }, [navigate, params]);

  return (
    <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center', background: 'var(--sec-bg-base)' }}>
      <div className="sec-spinner" />
    </div>
  );
}
