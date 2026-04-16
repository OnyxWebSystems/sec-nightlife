/**
 * Legacy route — redirects to Host dashboard create flow.
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function CreateHostEvent() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${createPageUrl('HostDashboard')}?create=party`, { replace: true });
  }, [navigate]);
  return null;
}
