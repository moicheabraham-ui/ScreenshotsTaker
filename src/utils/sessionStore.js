/**
 * Session storage manager using IndexedDB and LocalStorage.
 * Persists sessions, video metadata, file handles, thumbnails, pinned timestamps,
 * and Lightroom-style flags (Z/X).
 */

const DB_NAME = 'FrameForge4K_DB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_APP_STATE = 'app_state';
const LOCAL_STORAGE_LAST_SESSION_KEY = 'frameforge_last_active_session_id';

// In-memory cache for live File objects during runtime
// Map<itemId, File>
const runtimeFileMap = new Map();

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_APP_STATE)) {
        db.createObjectStore(STORE_APP_STATE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Register a live File object in memory
 */
export function registerRuntimeFile(itemId, file) {
  if (itemId && file) {
    runtimeFileMap.set(itemId, file);
  }
}

/**
 * Retrieve a live File object by itemId
 */
export function getRuntimeFile(itemId) {
  return runtimeFileMap.get(itemId) || null;
}

/**
 * Get all sessions sorted by updatedAt descending (only returns sessions with imported items)
 */
export async function getAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      // USER REQUIREMENT: Only sessions with actual imported items are valid
      const sessions = all.filter(s => Array.isArray(s.items) && s.items.length > 0);
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Permanently purge any empty sessions (0 items) from IndexedDB
 */
export async function purgeEmptySessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_APP_STATE], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const stateStore = tx.objectStore(STORE_APP_STATE);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const emptySessions = all.filter(s => !s.items || s.items.length === 0);
      for (const s of emptySessions) {
        store.delete(s.id);
        try {
          if (localStorage.getItem(LOCAL_STORAGE_LAST_SESSION_KEY) === s.id) {
            localStorage.removeItem(LOCAL_STORAGE_LAST_SESSION_KEY);
          }
        } catch (e) {}
      }

      const stateReq = stateStore.get('lastActiveSessionId');
      stateReq.onsuccess = () => {
        if (stateReq.result && emptySessions.some(s => s.id === stateReq.result.value)) {
          stateStore.delete('lastActiveSessionId');
        }
      };

      tx.oncomplete = () => resolve(emptySessions.length);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get single session by ID
 */
export async function getSessionById(sessionId) {
  if (!sessionId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.get(sessionId);

    request.onsuccess = async () => {
      const session = request.result;
      if (!session) {
        resolve(null);
        return;
      }

      // Re-attach live File instances from runtime cache or file handles
      if (session.items) {
        session.items = await Promise.all(session.items.map(async (item) => {
          let file = runtimeFileMap.get(item.id) || item.file || null;

          // If File is not in memory but FileSystemFileHandle is stored in IndexedDB
          if (!file && item.fileHandle) {
            try {
              const perm = await item.fileHandle.queryPermission({ mode: 'read' });
              if (perm === 'granted') {
                file = await item.fileHandle.getFile();
                runtimeFileMap.set(item.id, file);
              }
            } catch (err) {
              console.warn('Could not restore file from handle:', item.name, err);
            }
          }

          const pins = Array.isArray(item.pinnedTimestamps)
            ? item.pinnedTimestamps
            : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);

          return {
            ...item,
            pinnedTimestamps: pins,
            selectedTimestamp: item.selectedTimestamp ?? (pins[0] ?? null),
            isSLogDetected: Boolean(item.isSLogDetected),
            cstEnabled: item.cstEnabled !== undefined ? Boolean(item.cstEnabled) : Boolean(item.isSLogDetected),
            cstProfile: item.cstProfile || 'slog3_rec709',
            file,
          };
        }));
      }

      resolve(session);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save or update a session immediately
 */
export async function saveSession(session) {
  if (!session || !session.id) return null;

  // USER REQUIREMENT: Don't create or save a session until there is an import (items.length > 0)
  if (!session.items || session.items.length === 0) {
    try {
      await deleteSession(session.id);
    } catch (e) {}
    return null;
  }

  // Cache files in memory before saving
  if (session.items) {
    for (const item of session.items) {
      if (item.file) {
        runtimeFileMap.set(item.id, item.file);
      }
    }
  }

  // Sanitize items for IndexedDB
  const sanitizedItems = (session.items || []).map(item => {
    const liveFile = item.file || runtimeFileMap.get(item.id) || null;
    const pins = Array.isArray(item.pinnedTimestamps)
      ? item.pinnedTimestamps.filter(t => typeof t === 'number' && !isNaN(t))
      : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);

    const sanitized = {
      id: item.id,
      name: item.name,
      size: item.size,
      type: item.type,
      duration: item.duration,
      width: item.width,
      height: item.height,
      aspectRatio: item.aspectRatio,
      resolutionBadge: item.resolutionBadge,
      fps: item.fps,
      thumbnailUrl: item.thumbnailUrl,
      selectedTimestamp: item.selectedTimestamp ?? (pins[0] ?? null),
      pinnedTimestamps: pins,
      isSLogDetected: Boolean(item.isSLogDetected),
      cstEnabled: item.cstEnabled !== undefined ? Boolean(item.cstEnabled) : Boolean(item.isSLogDetected),
      cstProfile: item.cstProfile || 'slog3_rec709',
      flag: item.flag || 'unflagged', // 'flagged' (Z) | 'rejected' (X) | 'unflagged'
      status: item.status || 'pending',
      createdAt: item.createdAt || Date.now(),
    };

    // Store FileSystemFileHandle if present (Supported natively by IndexedDB structured clone)
    if (item.fileHandle) {
      sanitized.fileHandle = item.fileHandle;
    }

    // Persist File/Blob in IndexedDB if size is under 60MB so it survives browser/npm restarts natively!
    if (liveFile && liveFile.size && liveFile.size < 60 * 1024 * 1024) {
      sanitized.file = liveFile;
    }

    return sanitized;
  });

  const sessionRecord = {
    id: session.id,
    name: session.name || `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: session.createdAt || Date.now(),
    updatedAt: Date.now(),
    activeItemId: session.activeItemId || null,
    totalVideos: sanitizedItems.length,
    pinnedCount: sanitizedItems.reduce((acc, i) => acc + (i.pinnedTimestamps?.length || 0), 0),
    flaggedCount: sanitizedItems.filter(i => i.flag === 'flagged').length,
    rejectedCount: sanitizedItems.filter(i => i.flag === 'rejected').length,
    totalSizeBytes: sanitizedItems.reduce((acc, i) => acc + (i.size || 0), 0),
    items: sanitizedItems,
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_LAST_SESSION_KEY, session.id);
  } catch (e) {
    // Ignore localStorage errors
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_APP_STATE], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const stateStore = tx.objectStore(STORE_APP_STATE);

    store.put(sessionRecord);
    stateStore.put({ key: 'lastActiveSessionId', value: session.id });

    tx.oncomplete = () => {
      // Re-attach live files for the returned object
      sessionRecord.items = sessionRecord.items.map(item => ({
        ...item,
        file: runtimeFileMap.get(item.id) || item.file || null,
      }));
      resolve(sessionRecord);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId) {
  if (!sessionId) return false;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_APP_STATE], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const stateStore = tx.objectStore(STORE_APP_STATE);
    store.delete(sessionId);

    const stateReq = stateStore.get('lastActiveSessionId');
    stateReq.onsuccess = () => {
      if (stateReq.result && stateReq.result.value === sessionId) {
        stateStore.delete('lastActiveSessionId');
      }
    };

    tx.oncomplete = () => {
      try {
        if (localStorage.getItem(LOCAL_STORAGE_LAST_SESSION_KEY) === sessionId) {
          localStorage.removeItem(LOCAL_STORAGE_LAST_SESSION_KEY);
        }
      } catch (e) {}
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get last active session ID from LocalStorage or IndexedDB
 */
export async function getLastActiveSessionId() {
  // Check LocalStorage first for instant synchronous recall
  try {
    const localId = localStorage.getItem(LOCAL_STORAGE_LAST_SESSION_KEY);
    if (localId) return localId;
  } catch (e) {}

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_APP_STATE, 'readonly');
    const store = tx.objectStore(STORE_APP_STATE);
    const request = store.get('lastActiveSessionId');

    request.onsuccess = () => {
      resolve(request.result ? request.result.value : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create a new blank session
 */
export function createNewSession(name = null) {
  const now = new Date();
  const defaultName = name || `Session ${now.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return {
    id: 'session_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
    name: defaultName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeItemId: null,
    totalVideos: 0,
    pinnedCount: 0,
    flaggedCount: 0,
    rejectedCount: 0,
    totalSizeBytes: 0,
    items: [],
  };
}

/**
 * Re-link files to an existing session by matching name and size
 */
export function matchAndRelinkFiles(items, newFiles) {
  let relinkCount = 0;
  const updatedItems = items.map(item => {
    // If already has live file, keep it
    if (item.file) return item;

    // Try finding matching file by name and size tolerance, or exact name
    const match = newFiles.find(f => 
      f.name === item.name && (Math.abs(f.size - item.size) < 65536 || f.size === item.size)
    ) || newFiles.find(f => f.name === item.name);

    if (match) {
      registerRuntimeFile(item.id, match);
      relinkCount++;
      return {
        ...item,
        file: match,
      };
    }
    return item;
  });

  return { updatedItems, relinkCount };
}

/**
 * Clear last active session ID from local storage
 */
export function clearLastActiveSessionId() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_LAST_SESSION_KEY);
  } catch (e) {}
}

/**
 * Set last active session ID in local storage
 */
export function setLastActiveSessionId(sessionId) {
  try {
    if (sessionId) {
      localStorage.setItem(LOCAL_STORAGE_LAST_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_LAST_SESSION_KEY);
    }
  } catch (e) {}
}

