import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/** Legacy route — payout setup now lives in Sec Wallet on Profile / Business Dashboard. */
export default function Payments() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(createPageUrl('Profile?tab=wallet'), { replace: true });
  }, [navigate]);

  return null;
}
