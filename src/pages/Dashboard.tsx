import React from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import ErrorNotification from "../components/dashboard/ErrorNotification";
import GameResultsSection from "../components/dashboard/GameResultsSection";
import AvailableRooms from "../components/dashboard/AvailableRooms";
import GameSessionsList from "../components/dashboard/GameSessionsList";

function Dashboard() {
            const {
    loading,
              error,
    sessions,
    rooms,
    gameResults,
    isAdmin,
    activeGameSession,
    retryCount,
    maxRetries,
    joinRoom,
    handleLogout,
    retryLoading
  } = useDashboardData();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader 
          isAdmin={isAdmin} 
          activeGameSession={activeGameSession} 
          handleLogout={handleLogout} 
        />

        <ErrorNotification 
          error={error} 
          retryCount={retryCount} 
          maxRetries={maxRetries} 
          onRetry={retryLoading} 
        />

        <GameResultsSection gameResults={gameResults} />

        <AvailableRooms rooms={rooms} onJoinRoom={joinRoom} />

        <GameSessionsList sessions={sessions} />
                      </div>
    </div>
  );
}

export default Dashboard;
