import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TrendingUp, Users } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdminRegister, setIsAdminRegister] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    age: '',
    gender: '',
    adminCode: '', // Special code for admin registration
  });

  useEffect(() => {
    // Check for existing session on component mount
    const checkExistingSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session check error:', sessionError);
          setInitialLoading(false);
          return;
        }
        
        if (session) {
          console.log("Existing session found, redirecting...");
          // Check if user is an admin for proper redirection
          const { data: adminData } = await supabase
            .from('admin_users')
            .select('id')
            .eq('user_id', session.user.id)
            .maybeSingle();
            
          if (adminData) {
            navigate('/admin');
          } else {
            navigate('/dashboard');
          }
          return;
        }
        
        setInitialLoading(false);
      } catch (error) {
        console.error('Error checking session:', error);
        setInitialLoading(false);
      }
    };
    
    checkExistingSession();
  }, [navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isAdminRegister && formData.adminCode !== 'ADMIN123') {
        setError('Invalid admin registration code.');
        setLoading(false);
        return;
      }

      // First check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', formData.email)
        .maybeSingle();

      if (existingUser) {
        setError('An account with this email already exists. Please sign in instead.');
        setLoading(false);
        return;
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            age: parseInt(formData.age) || 0,
            gender: formData.gender
          }
        }
      });

      if (authError) {
        if (authError.message === 'User already registered') {
          setError('An account with this email already exists. Please sign in instead.');
        } else {
          console.error("Auth signup error:", authError);
          setError(authError.message || 'Failed to create account');
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      // Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id,
            email: formData.email,
            name: formData.name,
            age: parseInt(formData.age) || 0,
            gender: formData.gender,
          }
        ]);

      if (profileError) {
        console.error("Profile creation error:", profileError);
        throw new Error('Failed to create user profile');
      }

      // If admin registration, create admin user entry
      if (isAdminRegister) {
        const { error: adminError } = await supabase
          .from('admin_users')
          .insert([{ user_id: authData.user.id }]);

        if (adminError) {
          console.error("Admin creation error:", adminError);
          // Clean up user profile if admin creation fails
          await supabase
            .from('users')
            .delete()
            .eq('id', authData.user.id);
          throw new Error('Failed to create admin account');
        }
      }

      // Sign in the user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        console.error("Sign in error after registration:", signInError);
        throw signInError;
      }
      
      // Store session in localStorage as a backup
      if (signInData?.session) {
        try {
          localStorage.setItem('supabase_auth_token_backup', JSON.stringify({
            currentSession: {
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
              user: {
                id: signInData.user.id,
                email: signInData.user.email
              }
            }
          }));
          console.log('Backed up session to localStorage');
        } catch (e) {
          console.error('Error backing up session:', e);
        }
      }

      navigate(isAdminRegister ? '/admin' : '/dashboard');
    } catch (err) {
      console.error("Registration error:", err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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
          {isAdminRegister ? (
            <Users className="mx-auto h-12 w-12 text-blue-500" />
          ) : (
            <TrendingUp className="mx-auto h-12 w-12 text-green-500" />
          )}
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            {isAdminRegister ? 'Create Admin Account' : 'Create User Account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          {error && (
            <div className="bg-red-500 text-white p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <input
                type="email"
                name="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <input
                type="password"
                name="password"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
            <div>
              <input
                type="text"
                name="name"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Full name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div>
              <input
                type="number"
                name="age"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Age"
                value={formData.age}
                onChange={handleChange}
              />
            </div>
            <div>
              <select
                name="gender"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            {isAdminRegister && (
              <div>
                <input
                  type="password"
                  name="adminCode"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                  placeholder="Admin registration code"
                  value={formData.adminCode}
                  onChange={handleChange}
                />
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isAdminRegister 
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              } focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="flex flex-col space-y-4 text-center">
            <Link
              to="/"
              className="text-sm text-green-500 hover:text-green-400"
            >
              Already have an account? Sign in
            </Link>
            <button
              type="button"
              onClick={() => setIsAdminRegister(!isAdminRegister)}
              className="text-sm text-gray-400 hover:text-white"
            >
              {isAdminRegister ? 'Switch to User Registration' : 'Switch to Admin Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}