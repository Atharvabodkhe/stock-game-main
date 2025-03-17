import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, getCurrentSession } from '../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false 
}) => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Check for authentication and authorization
    const checkAuth = async () => {
      try {
        console.log('ProtectedRoute: Checking authentication...');
        setLoading(true);
        
        // Try to get session (includes recovery logic)
        const session = await getCurrentSession();
        
        if (!session) {
          console.log('ProtectedRoute: No session found, redirecting to login');
          setIsAuthenticated(false);
          setIsAuthorized(false);
          setLoading(false);
          return;
        }
        
        console.log('ProtectedRoute: Session found for user', session.user.id);
        setIsAuthenticated(true);
        
        // If admin access is required, check admin status
        if (requireAdmin) {
          console.log('ProtectedRoute: Checking admin status...');
          
          // Check if the user is an admin
          const { data: adminData, error: adminError } = await supabase
            .from('admin_users')
            .select('id')
            .eq('user_id', session.user.id)
            .maybeSingle();
            
          if (adminError && adminError.code !== 'PGRST116') {
            console.error('ProtectedRoute: Admin check error', adminError);
            setIsAuthorized(false);
          } else {
            setIsAuthorized(!!adminData);
            console.log('ProtectedRoute: Admin status -', !!adminData);
          }
        } else {
          // Not requiring admin, so user is authorized
          setIsAuthorized(true);
        }
        
      } catch (error) {
        console.error('ProtectedRoute: Auth check error', error);
        setIsAuthenticated(false);
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [requireAdmin]);

  if (loading) {
    // Show loading indicator while checking authentication
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Verifying your session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // If not authenticated, redirect to login
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (!isAuthorized) {
    // If authenticated but not authorized (e.g., not admin when admin required)
    return requireAdmin 
      ? <Navigate to="/dashboard" state={{ from: location }} replace />
      : <Navigate to="/" state={{ from: location }} replace />;
  }

  // If authenticated and authorized, render the children
  return <>{children}</>;
};

export default ProtectedRoute; 