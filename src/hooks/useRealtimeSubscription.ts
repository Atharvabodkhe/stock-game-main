import { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SubscriptionConfig {
  channelName: string;
  tables: {
    name: string;
    filter?: string;
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  }[];
  onMessage: (payload: any) => void;
  onError?: (error: any) => void;
  onStatusChange?: (status: string) => void;
}

export const useRealtimeSubscription = (config: SubscriptionConfig) => {
  const { channelName, tables, onMessage, onError, onStatusChange } = config;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCountRef = useRef(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const maxRetries = 5; // Reduced from 10 to 5
  const baseDelay = 300; // Reduced from 1000 to 300ms for faster recovery

  // This function manually forces a refresh of the channel
  const forceRefresh = useCallback(() => {
    if (channelRef.current) {
      console.log('Forcing channel refresh');
      channelRef.current.unsubscribe();
      setupChannel();
    }
  }, []);

  const setupChannel = useCallback(() => {
    try {
      console.log(`Setting up realtime channel: ${channelName}`);
      
      // First, clean up any existing channels with the same name
      supabase.getChannels()
        .filter(channel => {
          // Safely access properties
          const topic = (channel as any).sub?.topic;
          return topic && topic.includes(channelName);
        })
        .forEach(channel => {
          console.log(`Cleaning up existing channel: ${(channel as any).sub?.topic}`);
          supabase.removeChannel(channel);
        });
      
      if (channelRef.current) {
        console.log(`Unsubscribing from existing channel: ${(channelRef.current as any).sub?.topic || channelName}`);
        channelRef.current.unsubscribe();
      }

      // Create a unique channel name with a timestamp to avoid conflicts
      const uniqueChannelName = `${channelName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      console.log(`Creating new channel: ${uniqueChannelName}`);
      
      // Configure the channel with more robust options
      channelRef.current = supabase.channel(uniqueChannelName, {
        config: {
          broadcast: { self: true },
          presence: { key: '' }
        }
      });

      // Log the tables we're subscribing to
      console.log(`Subscribing to tables with channel config:`, channelRef.current);

      // Add subscription for each table
      tables.forEach(table => {
        const config = {
          event: table.event || '*',
          schema: 'public',
          table: table.name,
          ...(table.filter ? { filter: table.filter } : {})
        };
        
        console.log(`Adding listener for table ${table.name}:`, config);
        
        channelRef.current?.on(
          'postgres_changes' as any,
          config,
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log(`Received event for ${table.name}:`, payload);
            try {
              // Process messages immediately for critical tables
              if (table.name === 'game_rooms' || table.name === 'room_players') {
                // Priority processing - no delays
                setImmediate(() => {
                  const eventPayload = {
                    table: table.name,
                    payload,
                    eventType: payload.eventType,
                    new: payload.new,
                    old: payload.old
                  };
                  
                  onMessage(eventPayload);
                });
              } else {
                // Normal processing for non-critical tables
                const eventPayload = {
                  table: table.name, 
                  payload,
                  eventType: payload.eventType,
                  new: payload.new,
                  old: payload.old
                };
                
                onMessage(eventPayload);
              }
              
              // For critical tables, force a manual refresh after receiving an event
              // This ensures we have the most up-to-date data
              if (table.name === 'game_rooms' || table.name === 'room_players') {
                console.log(`Critical table ${table.name} updated, requesting data refresh`);
              }
            } catch (error) {
              console.error(`Error handling ${table.name} change:`, error);
              onError?.(error);
            }
          }
        );
      });

      console.log(`Subscribing to channel: ${uniqueChannelName}`);
      
      // Subscribe to the channel and handle status changes
      channelRef.current.subscribe(async (status) => {
        console.log(`Channel status changed: ${status}`);
        onStatusChange?.(status);

        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to channel: ${uniqueChannelName}`);
          setIsSubscribed(true);
          retryCountRef.current = 0;
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.log(`Channel error: ${status}. Attempting reconnection...`);
          setIsSubscribed(false);
          
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            console.log('No active session, aborting reconnection');
            return;
          }

          if (retryCountRef.current >= maxRetries) {
            console.log(`Maximum retries (${maxRetries}) reached, giving up`);
            return;
          }

          const delay = Math.min(
            baseDelay * Math.pow(1.2, retryCountRef.current), // Reduced exponential backoff factor
            5000 // Cap at 5 seconds (reduced from 30 seconds)
          );
          retryCountRef.current++;

          console.log(`Retry ${retryCountRef.current}/${maxRetries} in ${delay}ms`);

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            if (channelRef.current) {
              channelRef.current.unsubscribe();
            }
            setupChannel();
          }, delay);
        }
      });
    } catch (error) {
      console.error(`Error setting up channel ${channelName}:`, error);
      onError?.(error);
    }
  }, [channelName, tables, onMessage, onError, onStatusChange]);

  // Verify subscription periodically - more frequently than before
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (!isSubscribed && retryCountRef.current < maxRetries) {
        console.log('Subscription check: Not subscribed, attempting reconnect');
        forceRefresh();
      }
    }, 5000); // Check every 5 seconds (reduced from 30 seconds)
    
    return () => clearInterval(checkInterval);
  }, [isSubscribed, forceRefresh]);

  useEffect(() => {
    console.log('Setting up realtime subscription');
    setupChannel();

    return () => {
      console.log('Cleaning up realtime subscription');
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [setupChannel]);

  const reconnect = useCallback(() => {
    console.log('Manually reconnecting realtime subscription');
    retryCountRef.current = 0;
    setupChannel();
  }, [setupChannel]);

  return {
    reconnect,
    forceRefresh,
    channel: channelRef.current,
    isSubscribed
  };
};