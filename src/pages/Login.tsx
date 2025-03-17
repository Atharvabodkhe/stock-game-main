import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TrendingUp, Users } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [redirectInProgress, setRedirectInProgress] = useState(false);

  useEffect(() => {
    // Check for existing session on initial load
    checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle admin/user login mode toggle
  useEffect(() => {
    // Only check session if not currently in the middle of a redirect
    if (!redirectInProgress && !initialLoading) {
      checkExistingSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminLogin]);

  const checkExistingSession = async () => {
    try {
      console.log("Checking for existing session...");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        setInitialLoading(false);
        return;
      }
      
      console.log("Checking existing session:", session);
      
      if (session) {
        if (isAdminLogin) {
          // Check if user is an admin
          const { data: adminData, error: adminError } = await supabase
            .from('admin_users')
            .select('id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (adminError && adminError.code !== 'PGRST116') {
            console.error('Admin check error:', adminError);
            setInitialLoading(false);
            return;
          }

          if (adminData) {
            console.log("Admin user confirmed, redirecting to /admin");
            setRedirectInProgress(true);
            navigate('/admin');
          } else {
            setInitialLoading(false);
          }
        } else {
          console.log("Regular user session found, redirecting to /dashboard");
          setRedirectInProgress(true);
          navigate('/dashboard');
        }
      } else {
        console.log("No active session found");
        setInitialLoading(false);
      }
    } catch (error) {
      console.error('Session check error:', error);
      setInitialLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    console.log("Login attempt with email:", email);

    try {
      // Sign in without signing out first
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("Sign in error:", signInError);
        if (signInError.message === 'Invalid login credentials') {
          setError('Invalid email or password. Please try again.');
        } else {
          setError('An error occurred during login. Please try again.');
        }
        return;
      }

      console.log("Login successful:", data);

      if (!data.session || !data.user) {
        console.error("Missing session or user data");
        setError('Failed to create session. Please try again.');
        return;
      }

      // Store session in localStorage as a backup
      try {
        localStorage.setItem('supabase_auth_token_backup', JSON.stringify({
          currentSession: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user: {
              id: data.user.id,
              email: data.user.email
            }
          }
        }));
        console.log('Backed up session to localStorage');
      } catch (e) {
        console.error('Error backing up session:', e);
      }

      if (isAdminLogin) {
        console.log("Checking admin status for user:", data.user.id);
        // Check if user is an admin
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('id')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (adminError && adminError.code !== 'PGRST116') {
          console.error("Admin check error:", adminError);
          setError('Error checking admin status. Please try again.');
          return;
        }

        if (!adminData) {
          console.log("User is not an admin");
          setError('This account does not have admin privileges.');
          return;
        }

        console.log("Admin login successful, redirecting to /admin");
        setRedirectInProgress(true);
        navigate('/admin');
      } else {
        console.log("User login successful, redirecting to /dashboard");
        setRedirectInProgress(true);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl text-white">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {isAdminLogin ? (
            <Users className="mx-auto h-12 w-12 text-blue-500" />
          ) : (
            <TrendingUp className="mx-auto h-12 w-12 text-green-500" />
          )}
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            {isAdminLogin ? 'Admin Login' : 'Stock Market Simulator'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-500 text-white p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-t-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-b-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isAdminLogin 
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              } focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="flex flex-col space-y-4 text-center">
            {!isAdminLogin && (
              <Link
                to="/register"
                className="text-sm text-green-500 hover:text-green-400"
              >
                Don't have an account? Register
              </Link>
            )}
            <button
              type="button"
              onClick={() => setIsAdminLogin(!isAdminLogin)}
              className="text-sm text-gray-400 hover:text-white"
            >
              {isAdminLogin ? 'Switch to User Login' : 'Switch to Admin Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}