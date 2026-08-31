import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * Legacy in-app route. Web App Store Support URL (/HelpCenter) is rewritten
 * to static support.html on Vercel; this redirect covers Capacitor / SPA links.
 */
export default function HelpCenter() {
  const location = useLocation();
  return <Navigate to={`${createPageUrl('HelpGuides')}${location.search || ''}`} replace />;
}
