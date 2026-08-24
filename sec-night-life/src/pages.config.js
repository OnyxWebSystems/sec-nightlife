import { lazy } from 'react';
import __Layout from './Layout.jsx';
import Home from './pages/Home.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Login from './pages/Login.jsx';
import TicketVerify from './pages/TicketVerify.jsx';
import PaymentSuccess from './pages/PaymentSuccess.jsx';
import TicketSuccess from './pages/TicketSuccess.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Register from './pages/Register.jsx';
import UserAgreement from './pages/UserAgreement.jsx';
import TermsOfService from './pages/TermsOfService.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import { isStaleChunkLoadError, scheduleChunkReloadOnce } from './lib/chunkLoadRecovery';

const modules = import.meta.glob('./pages/*.jsx');

/**
 * Auth, payment deep-links, and signup legal docs are eager so guests never
 * sit on a blank spinner while a lazy chunk loads (incognito / cold cache).
 */
const EAGER_PAGES = new Set([
  'Home',
  'Onboarding',
  'Login',
  'Register',
  'TicketVerify',
  'PaymentSuccess',
  'TicketSuccess',
  'ForgotPassword',
  'ResetPassword',
  'UserAgreement',
  'TermsOfService',
  'PrivacyPolicy',
]);

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

const EAGER_IMPORTS = {
  Home,
  Onboarding,
  Login,
  Register,
  TicketVerify,
  PaymentSuccess,
  TicketSuccess,
  ForgotPassword,
  ResetPassword,
  UserAgreement,
  TermsOfService,
  PrivacyPolicy,
};

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
