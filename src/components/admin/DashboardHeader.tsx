import React from 'react';
import { Users, LogOut } from 'lucide-react';

interface DashboardHeaderProps {
  onLogout: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onLogout }) => {
  return (
    <div className="flex justify-between items-center mb-8">
      <div className="flex items-center gap-4">
        <Users className="text-blue-500" size={32} />
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
      </div>
      <button
        onClick={onLogout}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
      >
        <LogOut size={20} />
        Logout
      </button>
    </div>
  );
};

export default DashboardHeader; 