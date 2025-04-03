import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Clock, Plus, Trash2, Save } from 'lucide-react';

interface NewsEventManagerProps {
  selectedLevel: number;
}

const NewsEventManager = ({ selectedLevel }: NewsEventManagerProps) => {
  const { 
    levelNewsEvents,
    fetchLevelNewsEvents,
    updateNewsEvent,
    createNewsEvent,
    deleteNewsEvent
  } = useGameStore();

  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({ content: '', triggerTime: 120 });

  // Filter events for the selected level
  useEffect(() => {
    // Debug log to see what events we're getting from the store
    console.log(`Filtering for level ${selectedLevel}`, { 
      allEvents: levelNewsEvents, 
      selectedLevel 
    });
    
    const filteredEvents = levelNewsEvents
      .filter(event => event.level === selectedLevel)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    
    console.log(`Found ${filteredEvents.length} events for level ${selectedLevel}`, { 
      filteredEvents 
    });
    
    setEvents(filteredEvents);
    setIsLoading(false);
  }, [levelNewsEvents, selectedLevel]);

  // Load events on component mount
  useEffect(() => {
    const loadEvents = async () => {
      setIsLoading(true);
      console.log("Fetching level news events...");
      await fetchLevelNewsEvents();
      console.log("Finished fetching level news events");
      setIsLoading(false);
    };
    
    loadEvents();
  }, [fetchLevelNewsEvents]);

  // Handle updating an existing event
  const handleUpdateEvent = async (id: string, content: string, triggerTime: number) => {
    setIsLoading(true);
    await updateNewsEvent(id, content, triggerTime);
    setIsLoading(false);
  };

  // Handle creating a new event
  const handleCreateEvent = async () => {
    if (!newEvent.content.trim()) {
      alert('Please enter content for the news event');
      return;
    }

    setIsLoading(true);
    // Find the next sequence order
    const nextSequence = events.length > 0 
      ? Math.max(...events.map(e => e.sequenceOrder)) + 1
      : 1;
    
    console.log(`Creating new event for level ${selectedLevel}, sequence ${nextSequence}`);
    
    await createNewsEvent(
      selectedLevel,
      nextSequence,
      newEvent.content,
      newEvent.triggerTime
    );
    
    // Reset form
    setNewEvent({ content: '', triggerTime: 120 });
    setIsLoading(false);
  };

  // Handle deleting an event
  const handleDeleteEvent = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this news event?')) {
      setIsLoading(true);
      await deleteNewsEvent(id);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading news events...</div>;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-bold mb-4 flex items-center">
        <Clock className="mr-2" /> News Events for Level {selectedLevel + 1}
      </h2>
      
      {/* Existing events */}
      <div className="space-y-4 mb-8">
        {events.length === 0 ? (
          <p className="text-gray-400 italic">No news events for this level. Add one below.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <textarea
                    className="w-full bg-gray-600 text-white p-2 rounded-md mb-2"
                    value={event.content}
                    onChange={(e) => {
                      const updatedEvents = events.map(ev => 
                        ev.id === event.id ? { ...ev, content: e.target.value } : ev
                      );
                      setEvents(updatedEvents);
                    }}
                    rows={2}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Timer (seconds)</label>
                    <input
                      type="number"
                      className="w-24 bg-gray-600 text-white p-2 rounded-md"
                      value={event.triggerTimeSeconds}
                      onChange={(e) => {
                        const updatedEvents = events.map(ev => 
                          ev.id === event.id ? { ...ev, triggerTimeSeconds: parseInt(e.target.value) } : ev
                        );
                        setEvents(updatedEvents);
                      }}
                      min={1}
                    />
                  </div>
                  <div className="flex flex-col space-y-2 mt-6">
                    <button
                      className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      onClick={() => handleUpdateEvent(event.id, event.content, event.triggerTimeSeconds)}
                    >
                      <Save size={16} />
                    </button>
                    <button
                      className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                      onClick={() => handleDeleteEvent(event.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Add new event form */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Add New News Event</h3>
        <div className="flex items-start">
          <div className="flex-1 mr-4">
            <textarea
              className="w-full bg-gray-600 text-white p-2 rounded-md mb-2"
              value={newEvent.content}
              onChange={(e) => setNewEvent({ ...newEvent, content: e.target.value })}
              placeholder="Enter news content..."
              rows={2}
            />
          </div>
          <div className="flex items-center space-x-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Timer (seconds)</label>
              <input
                type="number"
                className="w-24 bg-gray-600 text-white p-2 rounded-md"
                value={newEvent.triggerTime}
                onChange={(e) => setNewEvent({ ...newEvent, triggerTime: parseInt(e.target.value) })}
                min={1}
              />
            </div>
            <button
              className="p-2 bg-green-600 text-white rounded-md hover:bg-green-700 mt-6"
              onClick={handleCreateEvent}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsEventManager; 