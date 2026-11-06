import { useCallback, useEffect, useRef, useState } from 'react';
import { readEvents, appendEvent, mergeEvents } from '../storage/eventHistory';

export default function useEventHistory() {
  const [events, setEvents] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyReadError, setHistoryReadError] = useState(null);
  const [historyWriteError, setHistoryWriteError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingEventsRef = useRef(new Map());

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const savedEvents = await readEvents();
      setEvents((current) => mergeEvents(current, savedEvents));
      setHistoryLoaded(true);
      setHistoryReadError(null);
    } catch (error) {
      console.warn('Unable to read event history', error);
      setHistoryReadError('Your saved journal could not be loaded. Existing records are kept untouched.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const persistEvent = useCallback(async (event) => {
    try {
      await appendEvent(event);
      pendingEventsRef.current.delete(event.id);
      setPendingCount(pendingEventsRef.current.size);
      if (pendingEventsRef.current.size === 0) setHistoryWriteError(null);
    } catch (error) {
      console.warn('Unable to save event history', error);
      setHistoryWriteError('Some alerts have not been saved yet. Keep the app open and tap Retry.');
    }
  }, []);
  const addEvent = useCallback((event) => {
    pendingEventsRef.current.set(event.id, event);
    setPendingCount(pendingEventsRef.current.size);
    setEvents((current) => mergeEvents([event], current));
    persistEvent(event);
  }, [persistEvent]);
  const retryHistory = useCallback(() => {
    if (historyReadError) loadHistory();
    pendingEventsRef.current.forEach((event) => { persistEvent(event); });
  }, [historyReadError, loadHistory, persistEvent]);

  return { events, historyLoaded, historyLoading, historyReadError, historyWriteError, pendingCount, addEvent, loadHistory, retryHistory };
}
