/**
 * Native shell setup — status bar, splash screen, deep links (Capacitor only).
 */
import { Capacitor } from '@capacitor/core';
import { handleDeepLinkPath, pathFromAppUrl } from '@/lib/deepLink';

export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#000000' });
  } catch (err) {
    console.warn('[native] status bar:', err?.message || err);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[native] splash:', err?.message || err);
  }

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', (event) => {
      const path = pathFromAppUrl(event?.url);
      if (path) handleDeepLinkPath(path);
    });
  } catch (err) {
    console.warn('[native] deep link listener:', err?.message || err);
  }
}
