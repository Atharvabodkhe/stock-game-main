import React from 'react';
import { Users } from 'lucide-react';

interface LoadingIndicatorProps {
  message?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  message = 'Loading admin dashboard...'
}) => {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <Users className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <p className="text-xl">{message}</p>
      </div>
    </div>
  );
};

export default LoadingIndicator; 