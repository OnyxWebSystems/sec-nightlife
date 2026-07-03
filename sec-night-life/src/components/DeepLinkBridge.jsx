import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerDeepLinkNavigate } from '@/lib/deepLink';

/** Wires Capacitor appUrlOpen to React Router navigate. */
export default function DeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    registerDeepLinkNavigate((path) => navigate(path));
    return () => registerDeepLinkNavigate(null);
  }, [navigate]);

  return null;
}
