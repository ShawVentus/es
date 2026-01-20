import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';
// 金融模块页面
import { Home as FinanceHome, MyData, ModelBuilding, ReportAnalysis, DataPreview } from '~/components/Finance/pages';

// 金融页面加载占位
const FinancePageFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full" />
  </div>
);

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login',
              element: <Login />,
            },
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        dashboardRoutes,
        {
          path: '/',
          element: <Root />,
          children: [
            // 金融首页 - 根路径
            {
              index: true,
              element: (
                <Suspense fallback={<FinancePageFallback />}>
                  <FinanceHome />
                </Suspense>
              ),
            },
            // LibreChat 聊天路由
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              path: 'search',
              element: <Search />,
            },
            {
              path: 'agents',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'agents/:category',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            // 金融模块页面
            {
              path: 'my-data',
              element: (
                <Suspense fallback={<FinancePageFallback />}>
                  <MyData />
                </Suspense>
              ),
            },
            {
              path: 'model-building',
              element: (
                <Suspense fallback={<FinancePageFallback />}>
                  <ModelBuilding />
                </Suspense>
              ),
            },
            {
              path: 'report-analysis',
              element: (
                <Suspense fallback={<FinancePageFallback />}>
                  <ReportAnalysis />
                </Suspense>
              ),
            },
            {
              path: 'data-preview',
              element: (
                <Suspense fallback={<FinancePageFallback />}>
                  <DataPreview />
                </Suspense>
              ),
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
