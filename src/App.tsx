// ===================================
// App - Main Application Component with Routing
// ===================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage, POSPage, ProductsPage, StockPage, ReportsPage, ClosurePage, SettingsPage, CategoriesPage, BackupPage, UsersPage, ActivityPage, DashboardPage } from './pages';
import MenusPage from './pages/MenusPage';
import { AdminLayout } from './layouts/AdminLayout';
import { useAuthStore } from './stores';

// Import styles
import './styles/index.css';
import './styles/components/button.css';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Role-based Protected Route
const RoleRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles: string[]; // 'admin' | 'manager' | 'cashier'
}> = ({ children, allowedRoles }) => {
  const { currentUser } = useAuthStore();

  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
};


// Import stores for sync
import { startAutoSync, useSyncStore, useProductStore, useMenuStore } from './stores';
import { useImageCacheStore } from './stores/imageCacheStore';
import { logger, initGlobalErrorHandling } from './services/logger';
import { useEffect, useState } from 'react';
import { SplashScreen, UpdateChecker } from './components/ui';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Initialize Auto Sync globally and force initial product load
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initGlobalErrorHandling();
        // Init Image Cache (Tauri only)
        const { initCache } = useImageCacheStore.getState();
        await initCache();

        // Start auto-sync
        startAutoSync();

        // Force initial product load from backend FIRST
        const { pullUpdates } = useSyncStore.getState();
        await pullUpdates();
        console.log('[App] Initial product sync complete');

        // THEN check and download missing images
        const { products } = useProductStore.getState();
        const { menus } = useMenuStore.getState();

        console.log(`[App] Checking cache for ${products.length} products and ${menus.length} menus`);
        const { checkMissingCache } = useImageCacheStore.getState();
        await checkMissingCache([...products, ...menus]);
        console.log('[App] Image cache check complete');
        logger.info('App initialized successfully');
      } catch (err) {
        console.error('[App] Failed to initialize app:', err);
        logger.error('Failed to initialize app', err);
      }
    };

    initializeApp();
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LoginPage />} />

        {/* POS Route (Protected) */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <POSPage />
            </ProtectedRoute>
          }
        />

        {/* Admin Routes (Protected) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="reports" element={<ReportsPage />} />

          {/* Restricted Routes */}
          <Route path="products" element={
            <RoleRoute allowedRoles={['admin', 'manager']}>
              <ProductsPage />
            </RoleRoute>
          } />
          <Route path="categories" element={
            <RoleRoute allowedRoles={['admin', 'manager']}>
              <CategoriesPage />
            </RoleRoute>
          } />
          <Route path="menus" element={
            <RoleRoute allowedRoles={['admin', 'manager']}>
              <MenusPage />
            </RoleRoute>
          } />
          <Route path="stock" element={
            <RoleRoute allowedRoles={['admin', 'manager']}>
              <StockPage />
            </RoleRoute>
          } />

          <Route path="closure" element={<ClosurePage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="users" element={
            <RoleRoute allowedRoles={['admin']}>
              <UsersPage />
            </RoleRoute>
          } />
        </Route>

        {/* Legacy Redirects (for backward compatibility) */}
        <Route path="/products" element={<Navigate to="/admin/products" replace />} />
        <Route path="/stock" element={<Navigate to="/admin/stock" replace />} />
        <Route path="/reports" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

        {/* Fallback Route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Auto-Update Checker */}
      <UpdateChecker />
    </BrowserRouter>
  );
}

export default App;
