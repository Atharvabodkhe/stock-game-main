import React, { useState } from 'react';
import { Edit, Check, X } from 'lucide-react';

interface NewsManagementProps {
  news: string[];
  updateNewsForLevel: (level: number, news: string) => void;
}

const NewsManagement: React.FC<NewsManagementProps> = ({
  news,
  updateNewsForLevel
}) => {
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [editedLevelNews, setEditedLevelNews] = useState('');

  const handleNewsUpdate = (level: number) => {
    if (editedLevelNews.trim()) {
      updateNewsForLevel(level, editedLevelNews);
      setEditingLevel(null);
      setEditedLevelNews('');
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-8">
      <h2 className="text-xl font-semibold mb-4">Level News Management</h2>
      <div className="space-y-4">
        {news.map((newsItem, index) => (
          <div key={index} className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold mb-2">Level {index + 1}</h3>
              {editingLevel === index ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleNewsUpdate(index)}
                    className="text-green-500 hover:text-green-400"
                  >
                    <Check size={20} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingLevel(null);
                      setEditedLevelNews('');
                    }}
                    className="text-red-500 hover:text-red-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingLevel(index);
                    setEditedLevelNews(newsItem);
                  }}
                  className="text-blue-500 hover:text-blue-400"
                >
                  <Edit size={20} />
                </button>
              )}
            </div>
            {editingLevel === index ? (
              <textarea
                value={editedLevelNews}
                onChange={(e) => setEditedLevelNews(e.target.value)}
                className="w-full bg-gray-600 text-white px-3 py-2 rounded mt-2"
                rows={3}
                placeholder="Enter news for this level..."
              />
            ) : (
              <p className="text-gray-300">{newsItem}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsManagement; 