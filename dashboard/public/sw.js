const SW_VERSION = '2026-05-02-v3';
const DB_NAME = 'orthodontic-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'pending-uploads';

// Force activation of new service worker on install
self.addEventListener('install', (event) => {
  console.log('[SW] Install', SW_VERSION);
  self.skipWaiting();
});

// Take control of all open pages immediately on activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', SW_VERSION);
  event.waitUntil(self.clients.claim());
});

// Initialize IndexedDB
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
      }
    };
  });
}

// Convert FormData to base64 encoded object
async function formDataToBase64(formData) {
  const data = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const buffer = await value.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binaryString = String.fromCharCode.apply(null, bytes);
      data[key] = btoa(binaryString);
    } else {
      data[key] = value;
    }
  }

  return data;
}

// Convert base64 back to blob
function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// Get exponential backoff delay
function getRetryDelay(retries) {
  const delays = [1000, 2000, 4000, 8000, 16000, 30000];
  return delays[Math.min(retries, delays.length - 1)];
}

// Add upload to queue
async function addToQueue(request, uploadData) {
  const db = await getDB();
  const id = crypto.randomUUID();

  const upload = {
    id,
    unidadeId: uploadData.unidadeId,
    filesData: uploadData.filesData,
    timestamp: Date.now(),
    status: 'pending',
    retries: 0,
    nextRetryAt: Date.now(),
    lastError: null,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const addRequest = store.add(upload);

    addRequest.onerror = () => reject(addRequest.error);
    addRequest.onsuccess = () => resolve(id);

    transaction.onerror = () => reject(transaction.error);
  });
}

// Retry upload from queue
async function retryUpload(upload) {
  const db = await getDB();

  try {
    // Recreate FormData from base64 data
    const formData = new FormData();

    for (const [key, base64Data] of Object.entries(upload.filesData)) {
      if (key !== 'unidadeId') {
        const blob = base64ToBlob(base64Data, 'application/octet-stream');
        formData.append(key, blob, `${key}.xlsx`);
      }
    }

    formData.append('unidade_id', upload.unidadeId.toString());

    // Try to send
    const response = await fetch('/api/import-upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      // Mark as synced
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const updated = { ...upload, status: 'synced' };
        const updateRequest = store.put(updated);

        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => {
          resolve({ success: true });
        };

        transaction.onerror = () => reject(transaction.error);
      });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    // Mark as failed with retry scheduled
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const retries = upload.retries + 1;
      const delay = getRetryDelay(retries);
      const nextRetryAt = Date.now() + delay;

      const updated = {
        ...upload,
        status: retries >= 5 ? 'failed' : 'pending',
        retries,
        lastError: error.message,
        nextRetryAt,
      };

      const updateRequest = store.put(updated);

      updateRequest.onerror = () => reject(updateRequest.error);
      updateRequest.onsuccess = () => {
        resolve({ success: false, error: error.message });
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Process all pending uploads
async function processPendingUploads() {
  const db = await getDB();

  const allUploads = await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  const now = Date.now();
  const pendingUploads = allUploads.filter(
    u => (u.status === 'pending' || u.status === 'failed') && u.nextRetryAt <= now
  );

  for (const upload of pendingUploads) {
    try {
      await retryUpload(upload);
    } catch (error) {
      console.error('Error retrying upload:', error);
    }
  }
}

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  if (!event.request.url.includes('/api/import-upload') || event.request.method !== 'POST') {
    return;
  }

  // If browser reports being online, do NOT intercept at all -
  // let the request flow normally so the user sees real server errors.
  if (self.navigator && self.navigator.onLine === true) {
    console.log('[SW] Online - bypass interception');
    return;
  }

  console.log('[SW] Offline - intercepting upload');

  event.respondWith(
    (async () => {
      let networkError = null;
      try {
        // Try to send normally
        const response = await fetch(event.request.clone());

        // IMPORTANT: pass-through ALL HTTP responses (even 4xx/5xx).
        // We only enqueue on actual network failures (offline, dns, etc.)
        return response;
      } catch (error) {
        // True network error (offline, DNS failure, etc.) - queue for retry
        networkError = error;
      }

      // Only reaches here if there was a network error
      try {
        const request = event.request.clone();
        const formData = await request.formData();
        const unidadeId = parseInt(formData.get('unidade_id'), 10);

        // Extract file data
        const filesData = {};
        for (const [key, value] of formData.entries()) {
          if (value instanceof File) {
            const buffer = await value.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const binaryString = String.fromCharCode.apply(null, bytes);
            filesData[key] = btoa(binaryString);
          }
        }

        // Add to queue
        await addToQueue(request, { unidadeId, filesData });

        // Register for background sync if available
        try {
          const registration = self.registration;
          if (registration && 'sync' in registration) {
            await registration.sync.register('upload-sync');
          }
        } catch (syncError) {
          console.warn('Background sync not available:', syncError);
        }

        // Return response indicating queued
        return new Response(
          JSON.stringify({
            success: false,
            queued: true,
            error: 'Offline - arquivo será enviado quando conexão retornar',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (queueError) {
        console.error('Error queueing upload:', queueError);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao salvar arquivo para envio posterior: ' + (networkError && networkError.message) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })()
  );
});

// Listen for background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-sync') {
    event.waitUntil(processPendingUploads());
  }
});

// Listen for online event
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'RETRY_UPLOADS') {
    event.waitUntil(processPendingUploads());
  }
});

// Handle online/offline events
self.addEventListener('online', () => {
  processPendingUploads().catch(console.error);
});
