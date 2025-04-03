import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

// Import hooks
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminData } from '../hooks/useAdminData';
import { useRoomActions } from '../hooks/useRoomActions';
import { useRealtime } from '../hooks/useRealtime';

// Import components
import LoadingIndicator from '../components/admin/LoadingIndicator';
import ErrorDisplay from '../components/admin/ErrorDisplay';
import DashboardHeader from '../components/admin/DashboardHeader';
import GameRoomsList from '../components/admin/GameRoomsList';
import CompletedRooms from '../components/admin/CompletedRooms';
import NewsEventManager from '../components/admin/NewsEventManager';
import StockPriceManager from '../components/admin/StockPriceManager';

// Import utils
import { safeUserExtract, getProfit } from '../components/admin/utils';

function AdminDashboard() {
  const navigate = useNavigate();
  
  // Use authentication hook
  const { 
    isAdmin, 
    loading: authLoading, 
    error: authError, 
    setError: setAuthError,
    handleLogout 
  } = useAdminAuth();

  // Get game store data
  const { 
    isPaused,
    setPaused,
    fetchLevelNewsEvents
  } = useGameStore();

  // Use admin data hook
  const {
    rooms,
    completedRooms,
    setCompletedRooms,
    results,
    loading: dataLoading,
    error: dataError,
    setError: setDataError,
    retryCount,
    maxRetries,
    selectedRoom,
    setSelectedRoom,
    loadRooms,
    loadRoomsFast,
    loadCompletedRooms,
    loadResults,
    setRooms
  } = useAdminData(isAdmin);

  // Use room actions hook
  const {
    newRoom,
    setNewRoom,
    deleteConfirmation,
    setDeleteConfirmation,
    startingGame,
    showCompletedRooms,
    setShowCompletedRooms,
    createRoom,
    deleteRoom,
    startGame,
    handleMinPlayersChange,
    handleMaxPlayersChange
  } = useRoomActions(
    rooms,
    setRooms,
    setCompletedRooms,
    loadRoomsFast,
    loadCompletedRooms,
    setDataError
  );

  // Use realtime hook
  const { isSubscribed } = useRealtime(
    selectedRoom,
    loadRoomsFast,
    loadCompletedRooms,
    loadResults,
    setRooms,
    setCompletedRooms,
    setDataError,
    rooms
  );

  // Loading state
  const loading = authLoading || dataLoading;
  
  // Combined error state
  const error = authError || dataError;

  const [selectedLevel, setSelectedLevel] = useState(0);

  // Add useEffect to fetch news events when the component mounts
  useEffect(() => {
    fetchLevelNewsEvents();
  }, [fetchLevelNewsEvents]);

  if (loading) {
    return <LoadingIndicator />;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader onLogout={handleLogout} />

        <ErrorDisplay 
          error={error} 
          retryCount={retryCount} 
          maxRetries={maxRetries} 
        />

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <div className="flex space-x-4">
            {/* ... existing controls ... */}
          </div>
        </div>
        
        {/* Level selector */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Select Level</h2>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                className={`py-2 px-4 rounded-md ${
                  selectedLevel === i 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                onClick={() => setSelectedLevel(i)}
              >
                Level {i + 1}
              </button>
            ))}
          </div>
        </div>
        
        {/* News Events Manager */}
        <NewsEventManager selectedLevel={selectedLevel} />
        
        {/* Stock Price Manager */}
        <StockPriceManager selectedLevel={selectedLevel} />

        <GameRoomsList
          rooms={rooms}
          results={results}
          selectedRoom={selectedRoom}
          startingGame={startingGame}
          newRoom={newRoom}
          deleteConfirmation={deleteConfirmation}
          setNewRoom={setNewRoom}
          createRoom={createRoom}
          handleMinPlayersChange={handleMinPlayersChange}
          handleMaxPlayersChange={handleMaxPlayersChange}
          safeUserExtract={safeUserExtract}
          getProfit={getProfit}
          startGame={startGame}
          loadResults={loadResults}
          setDeleteConfirmation={setDeleteConfirmation}
          deleteRoom={deleteRoom}
        />

        <CompletedRooms 
          showCompletedRooms={showCompletedRooms}
          setShowCompletedRooms={setShowCompletedRooms}
          completedRooms={completedRooms}
          navigate={navigate}
          deleteRoom={deleteRoom}
        />
      </div>
    </div>
  );
}

export default AdminDashboard;