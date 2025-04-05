import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, LogOut } from 'lucide-react';

interface DashboardHeaderProps {
  isAdmin: boolean;
  activeGameSession: string | null;
  handleLogout: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  isAdmin, 
  activeGameSession, 
  handleLogout 
}) => {
  const navigate = useNavigate();
  
  return (
    <div className="flex justify-between items-start mb-8">
      <div className="flex items-center gap-4">
        <TrendingUp className="text-green-500" size={32} />
        <h1 className="text-3xl font-bold text-white">Trading History</h1>
      </div>

      <div className="flex flex-col gap-4 min-w-[300px]">
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Admin Dashboard
          </button>
        )}
        <button
          onClick={() => navigate("/game")}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          New Game
        </button>
        {activeGameSession && (
          <button
            onClick={() =>
              navigate("/game", { state: { sessionId: activeGameSession } })
            }
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Resume Active Game
          </button>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default DashboardHeader; 