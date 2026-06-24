import { lazy } from 'react';
import __Layout from './Layout.jsx';
import Home from './pages/Home.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Login from './pages/Login.jsx';
import { isStaleChunkLoadError, scheduleChunkReloadOnce } from './lib/chunkLoadRecovery';

const modules = import.meta.glob('./pages/*.jsx');

const EAGER_PAGES = new Set(['Home', 'Onboarding', 'Login']);

/** Warm Vite chunk for a route name (e.g. "Profile") before navigation. Safe to call repeatedly. */
export function prefetchPage(pageName) {
  if (!pageName || typeof pageName !== 'string') return Promise.resolve();
  if (EAGER_PAGES.has(pageName)) return Promise.resolve();
  const key = `./pages/${pageName}.jsx`;
  const loader = modules[key];
  if (typeof loader !== 'function') return Promise.resolve();
  return loader().catch(() => {});
}

function lazyPage(loader) {
  return lazy(async () => {
    try {
      const mod = await loader();
      return { default: mod.default };
    } catch (err) {
      if (isStaleChunkLoadError(err)) scheduleChunkReloadOnce();
      throw err;
    }
  });
}

const EAGER_IMPORTS = { Home, Onboarding, Login };

export const PAGES = Object.fromEntries(
  Object.entries(modules).map(([path, loader]) => {
    const m = path.match(/\.\/pages\/(.+)\.jsx$/);
    const name = m ? m[1] : null;
    if (!name) return null;
    if (EAGER_IMPORTS[name]) return [name, EAGER_IMPORTS[name]];
    return [name, lazyPage(loader)];
  }).filter(Boolean)
);

export const pagesConfig = {
  mainPage: 'Home',
  Pages: PAGES,
  Layout: __Layout,
};
