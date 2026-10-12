import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';

// Auth
import Login from './pages/auth/Login';

// Cashier
import CashierLayout from './pages/cashier/CashierLayout';

// Staff
import StaffLayout from './pages/staff/StaffLayout';
import PaymentVerificationPage from './pages/staff/PaymentVerificationPage';
import InventoryPage from './pages/staff/InventoryPage';
import MenuPage from './pages/staff/MenuPage';
import SupportChatPage from './pages/staff/SupportChatPage';

// Kitchen
import KitchenPage from './pages/kitchen/KitchenPage';

// Admin
import AdminLayout from './pages/admin/AdminLayout';
import StaffAccounts from './pages/admin/StaffAccounts';
import SystemSettings from './pages/admin/SystemSettings';
import AuditLog from './pages/admin/AuditLog';
import CustomerRestrictions from './pages/admin/CustomerRestrictions';
import RidersPage from './pages/admin/RidersPage';

// Manager
import ManagerLayout from './pages/manager/ManagerLayout';
import DashboardPage from './pages/manager/DashboardPage';
import SalesReportPage from './pages/manager/SalesReportPage';
import OversightKitchen from './pages/manager/OversightKitchen';
import OversightStocks from './pages/manager/OversightStocks';
import OversightMenu from './pages/manager/MenuPage';
import OversightDelivery from './pages/manager/OversightDelivery';

// Rider
import RiderLayout from './pages/rider/RiderLayout';
import ActiveDelivery from './pages/rider/ActiveDelivery';
import DeliveryHistory from './pages/rider/DeliveryHistory';
import RiderProfile from './pages/rider/RiderProfile';

// ── ProtectedRoute ─────────────────────────────────────────────────────────────
// allowedRoles: the roles whose HOME is this dashboard.
// A staff member who switched into this dashboard will have user.role = that
// dashboard role (e.g. switched to 'cashier' → user.role is 'cashier').
// So we just check user.role against allowedRoles — switching already
// changes the token/user.role, no extra logic needed here.
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', fontFamily:'var(--font-body)', color:'var(--color-muted-foreground)', fontSize:'0.875rem' }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// ── RiderRoute — only allows JWT type='rider' ──────────────────────────────────
function RiderRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', fontFamily:'var(--font-body)', color:'var(--color-muted-foreground)', fontSize:'0.875rem' }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (user.type !== 'rider') return <Navigate to="/" replace />;
  return children;
}

// ── LogoutRoute ────────────────────────────────────────────────────────────────
function LogoutRoute() {
  const { logout } = useAuth();
  useEffect(() => { logout(); }, [logout]);
  return <Navigate to="/login" replace />;
}

// ── RoleRedirect — sends user to their home page ───────────────────────────────
function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.type === 'rider')         return <Navigate to="/rider/active" replace />;
  if (user.role === 'admin')         return <Navigate to="/admin/accounts" replace />;
  if (user.role === 'cashier')       return <Navigate to="/cashier" replace />;
  if (user.role === 'staff')         return <Navigate to="/staff/payments" replace />;
  if (user.role === 'kitchen_staff') return <Navigate to="/kitchen" replace />;
  if (user.role === 'manager' || user.role === 'owner') return <Navigate to="/manager/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <Routes>
              {/* ── Shared login (Staff + Rider) ── */}
              <Route path="/login" element={<Login />} />

              {/* ── Cashier ── */}
              <Route
                path="/cashier"
                element={
                  <ProtectedRoute allowedRoles={['cashier']}>
                    <CashierLayout />
                  </ProtectedRoute>
                }
              />

              {/* ── Staff ── */}
              <Route
                path="/staff"
                element={
                  <ProtectedRoute allowedRoles={['staff']}>
                    <StaffLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/staff/payments" replace />} />
                <Route path="payments"  element={<PaymentVerificationPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="menu"      element={<MenuPage />} />
                <Route path="chat"      element={<SupportChatPage />} />
              </Route>

              {/* ── Kitchen ── */}
              <Route
                path="/kitchen"
                element={
                  <ProtectedRoute allowedRoles={['kitchen_staff']}>
                    <KitchenPage />
                  </ProtectedRoute>
                }
              />

              {/* ── Admin — admin is NEVER a switch target; always full re-login ── */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/admin/accounts" replace />} />
                <Route path="accounts"     element={<StaffAccounts />} />
                <Route path="riders"       element={<RidersPage />} />
                <Route path="settings"     element={<SystemSettings />} />
                <Route path="audit"        element={<AuditLog />} />
                <Route path="restrictions" element={<CustomerRestrictions />} />
                {/* Manager-view pages embedded inside Admin (no redirect to /manager) */}
                <Route path="dashboard"            element={<DashboardPage />} />
                <Route path="sales"                element={<SalesReportPage />} />
                <Route path="oversight/kitchen"    element={<OversightKitchen />} />
                <Route path="oversight/stocks"     element={<OversightStocks />} />
                <Route path="oversight/menu"       element={<OversightMenu />} />
                <Route path="oversight/delivery"   element={<OversightDelivery />} />
              </Route>

              {/* ── Manager/Owner — admin can also view (read-only, no backend changes) ── */}
              <Route
                path="/manager"
                element={
                  <ProtectedRoute allowedRoles={['manager', 'owner', 'admin']}>
                    <ManagerLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/manager/dashboard" replace />} />
                <Route path="dashboard"          element={<DashboardPage />} />
                <Route path="sales"              element={<SalesReportPage />} />
                <Route path="oversight"          element={<Navigate to="/manager/dashboard" replace />} />
                <Route path="oversight/kitchen"  element={<OversightKitchen />} />
                <Route path="oversight/stocks"   element={<OversightStocks />} />
                <Route path="oversight/menu"     element={<OversightMenu />} />
                <Route path="oversight/delivery" element={<OversightDelivery />} />
              </Route>

              {/* ── Rider ── */}
              <Route
                path="/rider"
                element={
                  <RiderRoute>
                    <RiderLayout />
                  </RiderRoute>
                }
              >
                <Route index   element={<Navigate to="/rider/active" replace />} />
                <Route path="active"  element={<ActiveDelivery />} />
                <Route path="history" element={<DeliveryHistory />} />
                <Route path="profile" element={<RiderProfile />} />
              </Route>

              {/* ── Misc ── */}
              <Route path="/logout" element={<LogoutRoute />} />
              <Route path="/"       element={<RoleRedirect />} />
              <Route path="*"       element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}