import { Route, Routes } from 'react-router-dom';
import { AdminPage } from '../features/admin/AdminPage';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { VehicleDetailPage } from '../features/inventory/VehicleDetailPage';
import { MyPurchasesPage } from '../features/purchase/MyPurchasesPage';
import { EmptyState } from '../shared/ui/States';
import { ToastProvider } from '../shared/ui/Toast';
import { AuthProvider } from './AuthProvider';
import { RequireAdmin, RequireAuth } from './guards';
import { Layout } from './Layout';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<RequireAuth />}>
              <Route index element={<InventoryPage />} />
              <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
              <Route path="/orders" element={<MyPurchasesPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
            <Route
              path="*"
              element={
                <div className="mx-auto max-w-3xl p-8">
                  <EmptyState title="Page not found">That page does not exist.</EmptyState>
                </div>
              }
            />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
