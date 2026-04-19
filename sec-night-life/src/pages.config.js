/**
 * Route configuration: page components are loaded on demand (code splitting).
 * Add a new route by creating `src/pages/YourPage.jsx` — it is picked up via `import.meta.glob`.
 */
import { lazy } from 'react';
import __Layout from './Layout.jsx';

const modules = import.meta.glob('./pages/*.jsx');

export const PAGES = Object.fromEntries(
  Object.entries(modules).map(([path, loader]) => {
    const m = path.match(/\.\/pages\/(.+)\.jsx$/);
    const name = m ? m[1] : null;
    if (!name) return null;
    return [name, lazy(loader)];
  }).filter(Boolean)
);

export const pagesConfig = {
  mainPage: 'Home',
  Pages: PAGES,
  Layout: __Layout,
};
