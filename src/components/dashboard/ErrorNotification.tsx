import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorNotificationProps {
  error: string | null;
  retryCount: number;
  maxRetries: number;
  onRetry: () => void;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  retryCount,
  maxRetries,
  onRetry
}) => {
  if (!error) return null;

  if (retryCount < maxRetries) {
    return (
      <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
        <AlertTriangle size={24} />
        <div>
          <p className="font-semibold">{error}</p>
          <p className="text-sm mt-1">
            Retrying... Attempt {retryCount + 1} of {maxRetries}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
      <AlertTriangle size={24} />
      <div>
        <p className="font-semibold">
          Failed to load data after multiple attempts
        </p>
        <button
          onClick={onRetry}
          className="text-sm mt-2 bg-white text-red-500 px-3 py-1 rounded hover:bg-red-100 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

export default ErrorNotification; 