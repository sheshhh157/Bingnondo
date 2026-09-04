import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import ManagerLayout from './pages/manager/ManagerLayout';
import DashboardPage from './pages/manager/DashboardPage';
import SalesReportPage from './pages/manager/SalesReportPage';
import OversightPage from './pages/manager/OversightPage';
import OversightKitchen from './pages/manager/OversightKitchen';
import OversightStocks from './pages/manager/OversightStocks';
import OversightDelivery from './pages/manager/OversightDelivery';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'var(--font-body)', color: 'var(--color-muted-foreground)', fontSize: '0.875rem' }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'manager' && user.role !== 'owner') return <Navigate to="/login" replace />;
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/manager/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/manager"
            element={
              <ProtectedRoute>
                <ManagerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/manager/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="sales" element={<SalesReportPage />} />
            <Route path="oversight" element={<OversightPage />} />
            <Route path="oversight/kitchen" element={<OversightKitchen />} />
            <Route path="oversight/stocks" element={<OversightStocks />} />
            <Route path="oversight/delivery" element={<OversightDelivery />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
