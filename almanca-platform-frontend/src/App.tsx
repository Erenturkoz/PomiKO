import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccountHome } from './pages/AccountHome';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { RoomPage } from './pages/RoomPage';
import { ErrorPage } from './pages/ErrorPage';

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/parent"
              element={
                <ProtectedRoute role="PARENT" mode="account">
                  <AccountHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student"
              element={
                <ProtectedRoute role="PARENT" mode="profile">
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <ProtectedRoute role="TEACHER">
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute role="ADMIN">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/room/:bookingId"
              element={
                <RequireAuth>
                  <RoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <ErrorPage
                  title="Bu sayfayı bulamadık"
                  message="Aradığın sayfa taşınmış ya da hiç var olmamış olabilir. Merak etme, geri dönüp devam edebilirsin."
                  emoji="🔎"
                />
              }
            />
          </Routes>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
