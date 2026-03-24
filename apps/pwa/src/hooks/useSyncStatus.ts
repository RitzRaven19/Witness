import { useEffect, useState } from 'react';
import { getQueueCount } from '../store/evidenceStore';

export function useSyncStatus(refreshKey: number) {
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    getQueueCount().then(setQueueCount).catch(() => {});
  }, [refreshKey]);

  return { online, queueCount };
}
