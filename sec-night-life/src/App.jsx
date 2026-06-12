import React, { Suspense } from 'react'
import RoutePageFallback from '@/components/RoutePageFallback'
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { ActiveVenueProvider } from '@/context/ActiveVenueContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import RequireBusinessAccount from '@/components/RequireBusinessAccount';
import RequireOnboardingComplete from '@/components/RequireOnboardingComplete';
const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;
const ONBOARDING_EXEMPT_PAGES = new Set([
  'Onboarding',
  'ProfileSetup',
  'VenueOnboarding',
  'Welcome',
  'Login',
  'Register',
  'ResetPassword',
  'PaymentSuccess',
  'TicketSuccess',
  'TicketVerify',
]);

function isPublicAppPath(pathname) {
  const segment = String(pathname || '').replace(/^\//, '').split('/')[0];
  return ONBOARDING_EXEMPT_PAGES.has(segment);
}
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
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const isPublicPage = isPublicAppPath(location.pathname);

  // Show loading spinner while checking app public settings or auth
  if (!isPublicPage && (isLoadingPublicSettings || isLoadingAuth)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
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

  return (
    <AuthProvider>
      <PreferencesProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ActiveVenueProvider>
              <NavigationTracker />
              <AuthenticatedApp />
            </ActiveVenueProvider>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </PreferencesProvider>
    </AuthProvider>
  )
}

export default App
