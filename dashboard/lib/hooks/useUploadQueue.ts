import { useEffect, useState, useCallback } from 'react';
import {
  initDB,
  getAllUploads,
  updateUpload,
  type PendingUpload,
} from '@/lib/db';

export interface UploadQueueState {
  pending: PendingUpload[];
  uploading: PendingUpload[];
  failed: PendingUpload[];
  synced: PendingUpload[];
}

export interface UseUploadQueueReturn {
  queue: UploadQueueState;
  isLoading: boolean;
  retryUpload: (id: string) => Promise<void>;
  clearSynced: () => Promise<void>;
}

export function useUploadQueue(): UseUploadQueueReturn {
  const [queue, setQueue] = useState<UploadQueueState>({
    pending: [],
    uploading: [],
    failed: [],
    synced: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load uploads from IndexedDB
  const loadUploads = useCallback(async () => {
    try {
      await initDB();
      const all = await getAllUploads();

      const grouped: UploadQueueState = {
        pending: all.filter((u: PendingUpload) => u.status === 'pending'),
        uploading: all.filter((u: PendingUpload) => u.status === 'uploading'),
        failed: all.filter((u: PendingUpload) => u.status === 'failed'),
        synced: all.filter((u: PendingUpload) => u.status === 'synced'),
      };

      setQueue(grouped);
    } catch (error) {
      console.error('Error loading uploads:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Retry a failed upload
  const retryUpload = useCallback(
    async (id: string) => {
      try {
        const upload = queue.failed.find((u: PendingUpload) => u.id === id);
        if (!upload) return;

        await updateUpload(id, {
          status: 'pending',
          retries: 0,
          nextRetryAt: Date.now(),
          lastError: undefined,
        });

        // Notify service worker
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'RETRY_UPLOADS',
          });
        }

        // Reload queue
        await loadUploads();
      } catch (error) {
        console.error('Error retrying upload:', error);
      }
    },
    [queue.failed, loadUploads]
  );

  // Clear synced uploads
  const clearSynced = useCallback(async () => {
    try {
      const db = await initDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['pending-uploads'], 'readwrite');
        const store = transaction.objectStore('pending-uploads');
        const index = store.index('status');
        const getAllRequest = index.getAll('synced');

        getAllRequest.onsuccess = () => {
          const synced = getAllRequest.result as PendingUpload[];
          synced.forEach((upload: PendingUpload) => {
            store.delete(upload.id);
          });
        };

        transaction.oncomplete = () => {
          loadUploads().then(resolve).catch(reject);
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Error clearing synced uploads:', error);
    }
  }, [loadUploads]);

  // Poll IndexedDB every 5 seconds
  useEffect(() => {
    loadUploads();

    const interval = setInterval(() => {
      loadUploads();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadUploads]);

  // Listen for service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UPLOAD_STATUS_CHANGED') {
        loadUploads();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [loadUploads]);

  return {
    queue,
    isLoading,
    retryUpload,
    clearSynced,
  };
}
