import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { Role, useAuth } from '../auth/AuthContext';

export function ProtectedRoute({
  role,
  mode,
  children,
}: {
  role: Role;
  mode?: 'account' | 'profile';
  children: ReactNode;
}) {
  const { user, session, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Yükleniyor…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
  }
  // Veli için mod (hesap/profil) kontrolü
  if (role === 'PARENT' && mode && session.mode !== mode) {
    return <Navigate to={session.mode === 'profile' ? '/student' : '/parent'} replace />;
  }
  return <>{children}</>;
}
