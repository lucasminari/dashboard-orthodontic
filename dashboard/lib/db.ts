// IndexedDB wrapper for managing pending uploads
const DB_NAME = 'orthodontic-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'pending-uploads';

export interface PendingUpload {
  id: string;
  unidadeId: number;
  filesData: Record<string, string>; // { leads: base64, sistema: base64, ... }
  timestamp: number;
  status: 'pending' | 'uploading' | 'failed' | 'synced';
  retries: number;
  lastError?: string;
  nextRetryAt: number;
}

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;

      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        const store = dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
      }
    };
  });
}

export async function addUpload(upload: Omit<PendingUpload, 'id'>): Promise<string> {
  const database = await initDB();
  const id = crypto.randomUUID();
  const uploadWithId: PendingUpload = { ...upload, id };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(uploadWithId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);
  });
}

export async function getUpload(id: string): Promise<PendingUpload | undefined> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function updateUpload(id: string, updates: Partial<PendingUpload>): Promise<void> {
  const database = await initDB();
  const existing = await getUpload(id);

  if (!existing) throw new Error(`Upload ${id} not found`);

  const updated: PendingUpload = { ...existing, ...updates };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(updated);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteUpload(id: string): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllUploads(): Promise<PendingUpload[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getUploadsByStatus(status: PendingUpload['status']): Promise<PendingUpload[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll(status);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getFailedUploads(): Promise<PendingUpload[]> {
  const database = await initDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('failed');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const failed = request.result.filter((u: PendingUpload) => u.nextRetryAt <= now);
      resolve(failed);
    };
  });
}

export async function clearSyncedUploads(): Promise<void> {
  const database = await initDB();
  const synced = await getUploadsByStatus('synced');

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    synced.forEach(upload => {
      store.delete(upload.id);
    });

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
