import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import CashierPage from './pages/cashier/CashierPage';
import StaffLayout from './pages/staff/StaffLayout';
import InventoryPage from './pages/staff/InventoryPage';
import MenuPage from './pages/staff/MenuPage';
import StaffPlaceholder from './pages/staff/StaffPlaceholder';
import KitchenPage from './pages/kitchen/KitchenPage';
import OwnerLayout from './pages/owner/OwnerLayout';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import AdminLayout from './pages/admin/AdminLayout';
import StaffAccounts from './pages/admin/StaffAccounts';
import SystemSettings from './pages/admin/SystemSettings';
import AuditLog from './pages/admin/AuditLog';
import CustomerRestrictions from './pages/admin/CustomerRestrictions';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', fontFamily:'var(--font-body)', color:'var(--color-muted-foreground)', fontSize:'0.875rem' }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'cashier') return <Navigate to="/cashier" replace />;
  if (user.role === 'staff') return <Navigate to="/staff/inventory" replace />;
  if (user.role === 'owner') return <Navigate to="/owner/dashboard" replace />;
  if (user.role === 'kitchen_staff') return <Navigate to="/kitchen" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/accounts" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Cashier */}
          <Route
            path="/cashier"
            element={
              <ProtectedRoute allowedRoles={['cashier']}>
                <CashierPage />
              </ProtectedRoute>
            }
          />

          {/* Staff — nested under StaffLayout */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['staff']}>
                <StaffLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/staff/inventory" replace />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="delivery" element={<StaffPlaceholder type="delivery" />} />
            <Route path="chat" element={<StaffPlaceholder type="chat" />} />
          </Route>

          {/* Owner */}
          <Route
            path="/owner"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <OwnerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/owner/dashboard" replace />} />
            <Route path="dashboard" element={<OwnerDashboard />} />
          </Route>

          {/* Kitchen */}
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute allowedRoles={['kitchen_staff', 'admin']}>
                <KitchenPage />
              </ProtectedRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/accounts" replace />} />
            <Route path="accounts" element={<StaffAccounts />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="audit"       element={<AuditLog />} />
            <Route path="restrictions" element={<CustomerRestrictions />} />
          </Route>

          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}