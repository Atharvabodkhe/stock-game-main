import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Game from './pages/Game';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import WaitingRoom from './pages/WaitingRoom';
import Leaderboard from './pages/Leaderboard';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900 text-white">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes for regular users */}
          <Route 
            path="/game" 
            element={
              <ProtectedRoute>
                <Game />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/waiting-room" 
            element={
              <ProtectedRoute>
                <WaitingRoom />
              </ProtectedRoute>
            } 
          />
          
          {/* Protected routes for admin users */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/leaderboard/:roomId" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <Leaderboard />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;