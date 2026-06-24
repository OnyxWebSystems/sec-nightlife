import React from 'react';
import SecLoadingScreen from '@/components/ui/SecLoadingScreen';

/** Inline route loading — keeps Layout visible while lazy chunks load. */
export default function RoutePageFallback() {
  return <SecLoadingScreen fullScreen={false} compact />;
}
