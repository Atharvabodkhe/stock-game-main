import React from 'react';
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
import StockControl from '../components/admin/StockControl';
import NewsManagement from '../components/admin/NewsManagement';
import CompletedRooms from '../components/admin/CompletedRooms';

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
    stocks, 
    stockPerformance,
    levelStocks,
    isPaused,
    news,
    updateStockPrice,
    updateNewsForLevel,
    setPaused
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

        <StockControl 
          stocks={stocks}
          stockPerformance={stockPerformance}
          levelStocks={levelStocks}
          isPaused={isPaused}
          setPaused={setPaused}
          updateStockPrice={updateStockPrice}
        />

        <NewsManagement 
          news={news}
          updateNewsForLevel={updateNewsForLevel}
        />

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