import React, { Suspense, useEffect } from 'react'
import RoutePageFallback from '@/components/RoutePageFallback'
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { removeBootSplash } from '@/lib/removeBootSplash'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { ActiveVenueProvider } from '@/context/ActiveVenueContext';
import { StaffVenueProvider } from '@/context/StaffVenueContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import SecLoadingScreen from '@/components/ui/SecLoadingScreen';
import RequireBusinessAccount from '@/components/RequireBusinessAccount';
import RequireOnboardingComplete from '@/components/RequireOnboardingComplete';
import VerifyEmail from '@/pages/VerifyEmail';
import { ONBOARDING_EXEMPT_PAGES, isPublicAppPath } from '@/lib/publicAuthPaths';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const BUSINESS_ONLY_PAGES = new Set([
  'BusinessDashboard',
  'VenueAnalytics',
  'BusinessEvents',
  'BusinessBookings',
  'BusinessMenu',
  'CreateJob',
  'BusinessJobs',
  'BusinessPromotions',
  'BusinessPromotionBoost',
  'BusinessMessages',
  'BusinessVenueTables',
  'FeedbackInsights',
  'VenueProfile',
]);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, navigateToLogin, user } = useAuth();
  const location = useLocation();
  const isPublicPage = isPublicAppPath(location.pathname);

  // Only block protected routes when we have no user to show yet (no cached session).
  if (!isPublicPage && isLoadingAuth && !user) {
    return <SecLoadingScreen message="Signing you in…" />;
  }

  // Handle authentication errors (public pages like TicketVerify must stay reachable without login)
  if (authError && !isPublicPage) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <Suspense fallback={<RoutePageFallback />}>
              {MainPage ? (
                ONBOARDING_EXEMPT_PAGES.has(mainPageKey) ? (
                  <MainPage />
                ) : (
                  <RequireOnboardingComplete>
                    <MainPage />
                  </RequireOnboardingComplete>
                )
              ) : null}
            </Suspense>
          </LayoutWrapper>
        }
      />
      <Route
        path="/reset-password"
        element={
          <LayoutWrapper currentPageName="ResetPassword">
            <Suspense fallback={<RoutePageFallback />}>
              {Pages.ResetPassword ? <Pages.ResetPassword /> : null}
            </Suspense>
          </LayoutWrapper>
        }
      />
      <Route
        path="/verify-email"
        element={
          <LayoutWrapper currentPageName="VerifyEmail">
            <VerifyEmail />
          </LayoutWrapper>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <LayoutWrapper currentPageName="ForgotPassword">
            <Suspense fallback={<RoutePageFallback />}>
              {Pages.ForgotPassword ? <Pages.ForgotPassword /> : null}
            </Suspense>
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages)
        .filter(([path]) => path !== 'FeedbackInsights')
        .map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <Suspense fallback={<RoutePageFallback />}>
                  {BUSINESS_ONLY_PAGES.has(path) ? (
                    <RequireBusinessAccount>
                      <Page />
                    </RequireBusinessAccount>
                  ) : ONBOARDING_EXEMPT_PAGES.has(path) ? (
                    <Page />
                  ) : (
                    <RequireOnboardingComplete>
                      <Page />
                    </RequireOnboardingComplete>
                  )}
                </Suspense>
              </LayoutWrapper>
            }
          />
        ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  useEffect(() => {
    removeBootSplash();
  }, []);

  return (
    <PreferencesProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthProvider>
            <ActiveVenueProvider>
              <StaffVenueProvider>
                <NavigationTracker />
                <AuthenticatedApp />
              </StaffVenueProvider>
            </ActiveVenueProvider>
          </AuthProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </PreferencesProvider>
  )
}

export default App
