/**
 * Legacy route — host events are now house parties on the Host dashboard.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function HostEventDetails() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('HostDashboard'), { replace: true });
  }, [navigate]);
  return null;
}
