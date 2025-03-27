import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorDisplayProps {
  error: string | null;
  retryCount: number;
  maxRetries: number;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  retryCount,
  maxRetries
}) => {
  if (!error) return null;
  
  return (
    <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
      <AlertTriangle size={24} />
      <div>
        <p className="font-semibold">{error}</p>
        {retryCount > 0 && retryCount < maxRetries && (
          <p className="text-sm mt-1">Retrying... ({retryCount}/{maxRetries})</p>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay; 