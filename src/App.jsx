import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { ImportDropZone } from './components/ImportDropZone';
import { VideoPlayer } from './components/VideoPlayer';
import { QueueManager } from './components/QueueManager';
import { FramePreviewModal } from './components/FramePreviewModal';
import { ExportProgressModal } from './components/ExportProgressModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { SessionManagerModal } from './components/SessionManagerModal';
import { 
  loadVideoMetadata, 
  generateQueueThumbnail 
} from './utils/videoProcessor';
import { 
  getAllSessions, 
  getSessionById, 
  saveSession, 
  deleteSession, 
  createNewSession, 
  purgeEmptySessions,
  getLastActiveSessionId,
  setLastActiveSessionId,
  clearLastActiveSessionId,
  matchAndRelinkFiles,
  registerRuntimeFile,
  getRuntimeFile
} from './utils/sessionStore';
import { UploadCloud, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Session State
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  // Queue & Player State
  const [queue, setQueue] = useState([]);
  const [activeItemId, setActiveItemId] = useState(null);
  const [previewModal, setPreviewModal] = useState({ isOpen: false, item: null, frameData: null });
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [isWindowDragOver, setIsWindowDragOver] = useState(false);

  // Hidden file input refs
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Guard ref to prevent auto-save from clobbering items during session hydration
  const isLoadingSessionRef = useRef(false);

  // Active item
  const activeItem = queue.find(item => item.id === activeItemId) || queue[0] || null;
  const activeIndex = queue.findIndex(item => item.id === (activeItem ? activeItem.id : null));

  // Ref tracking latest state for instant flush on unmount or beforeunload
  const latestStateRef = useRef({ currentSession, queue, activeItemId });
  useEffect(() => {
    latestStateRef.current = { currentSession, queue, activeItemId };
  }, [currentSession, queue, activeItemId]);

  // 1. Initial Load: Load sessions from IndexedDB on startup
  useEffect(() => {
    async function initSessions() {
      try {
        // USER REQUIREMENT: Purge any empty sessions (0 items) that might exist from previous runs
        await purgeEmptySessions();

        const all = await getAllSessions();
        setSessions(all);

        const lastId = await getLastActiveSessionId();
        let targetSession = null;

        if (lastId && all.some(s => s.id === lastId)) {
          const candidate = await getSessionById(lastId);
          if (candidate && candidate.items && candidate.items.length > 0) {
            targetSession = candidate;
          }
        }
        
        // If no target session yet, only pick a session that has actual clips (> 0)
        if (!targetSession && all.length > 0) {
          const candidate = all.find(s => s.items && s.items.length > 0);
          if (candidate) {
            targetSession = await getSessionById(candidate.id);
          }
        }

        // USER REQUIREMENT: Don't create a session until there is an import!
        if (targetSession && targetSession.items && targetSession.items.length > 0) {
          isLoadingSessionRef.current = true;
          const hydratedItems = (targetSession.items || []).map(item => ({
            ...item,
            file: getRuntimeFile(item.id) || item.file || null,
          }));

          latestStateRef.current = {
            currentSession: targetSession,
            queue: hydratedItems,
            activeItemId: targetSession.activeItemId || (hydratedItems[0]?.id) || null
          };

          setCurrentSession(targetSession);
          setQueue(hydratedItems);
          setActiveItemId(targetSession.activeItemId || (hydratedItems[0]?.id) || null);
        } else {
          // Fresh workspace without any session: clean slate until an import occurs!
          setCurrentSession(null);
          setQueue([]);
          setActiveItemId(null);
          clearLastActiveSessionId();
          latestStateRef.current = {
            currentSession: null,
            queue: [],
            activeItemId: null
          };
        }
      } catch (err) {
        console.error('Failed to initialize sessions from IndexedDB:', err);
      }
    }

    initSessions();
  }, []);

  // Synchronous/Immediate persistence helper
  const persistCurrentState = useCallback(async (forcedSession = null, forcedQueue = null, forcedActiveId = null) => {
    if (isLoadingSessionRef.current) return null;

    const sess = forcedSession || latestStateRef.current.currentSession;
    const q = forcedQueue !== null ? forcedQueue : latestStateRef.current.queue;
    const aid = forcedActiveId !== null ? forcedActiveId : latestStateRef.current.activeItemId;

    if (!sess || !sess.id) return null;

    // USER REQUIREMENT: Don't persist a session with 0 items!
    if (!q || q.length === 0) {
      try {
        await deleteSession(sess.id);
        clearLastActiveSessionId();
        setCurrentSession(null);
        setActiveItemId(null);
        const remaining = await getAllSessions();
        setSessions(remaining);
      } catch (err) {
        console.warn('Error purging empty session:', err);
      }
      return null;
    }

    try {
      const updated = {
        ...sess,
        activeItemId: aid,
        items: q,
      };
      const saved = await saveSession(updated);
      if (saved) {
        setCurrentSession(saved);
        const all = await getAllSessions();
        setSessions(all);
      }
      return saved;
    } catch (err) {
      console.error('Error saving session:', err);
      return null;
    }
  }, []);

  // 2. Auto-save current session state whenever queue or activeItemId changes
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    // Only auto-save if there is an active session AND items in queue!
    if (!currentSession || !currentSession.id || queue.length === 0) return;

    if (isLoadingSessionRef.current) {
      isLoadingSessionRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      persistCurrentState();
    }, 250);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [queue, activeItemId, currentSession?.id, persistCurrentState]);

  // Window beforeunload / pagehide: flush save immediately so stopping npm / closing tab preserves everything
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const { currentSession: sess, queue: q, activeItemId: aid } = latestStateRef.current;
      if (sess && sess.id && q && q.length > 0) {
        saveSession({ ...sess, activeItemId: aid, items: q });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // If activeItemId is null and queue has items, set first
  useEffect(() => {
    if ((!activeItemId || !queue.some(i => i.id === activeItemId)) && queue.length > 0) {
      setActiveItemId(queue[0].id);
    }
  }, [queue, activeItemId]);

  // Sequential background thumbnail generator
  const isGeneratingThumbnails = useRef(false);
  useEffect(() => {
    const processNextThumbnail = async () => {
      if (isGeneratingThumbnails.current) return;
      const nextItem = queue.find(item => item.thumbnailUrl === null);
      if (!nextItem) return;

      const file = nextItem.file || getRuntimeFile(nextItem.id);
      if (!file) return;

      isGeneratingThumbnails.current = true;
      try {
        const thumbUrl = await generateQueueThumbnail(file, nextItem.selectedTimestamp || 0.5);
        if (thumbUrl) {
          setQueue(prevQueue => {
            const updated = prevQueue.map(i => i.id === nextItem.id ? { ...i, thumbnailUrl: thumbUrl } : i);
            return updated;
          });
        }
      } catch (err) {
        console.warn('Thumbnail generation error:', err);
      } finally {
        isGeneratingThumbnails.current = false;
      }
    };

    processNextThumbnail();
  }, [queue]);

  // Re-link files helper
  const handleRelinkFiles = async (files) => {
    if (!files || files.length === 0 || queue.length === 0) return;
    const { updatedItems, relinkCount } = matchAndRelinkFiles(queue, files);
    if (relinkCount > 0) {
      setQueue(updatedItems);
      if (currentSession) {
        await persistCurrentState(currentSession, updatedItems, activeItemId);
      }
      setToastNotification(`Re-linked ${relinkCount} video file${relinkCount > 1 ? 's' : ''} successfully!`);
      setTimeout(() => setToastNotification(null), 3500);
    } else {
      setToastNotification(`No matching filenames found to re-link.`);
      setTimeout(() => setToastNotification(null), 3000);
    }
  };

  // 3. Import files handler: Creates a session for the import or re-links matching detached files
  const handleFilesSelected = async (files) => {
    if (!files || files.length === 0) return;

    // Check if user is re-linking existing detached files in the current active session
    if (queue.length > 0 && queue.some(item => !item.file)) {
      const hasMatchingFiles = files.some(f => queue.some(item => !item.file && item.name === f.name));
      if (hasMatchingFiles) {
        await handleRelinkFiles(files);
        return;
      }
    }

    // Otherwise, this is a fresh import: "Don't create a session until I do an import"
    const newItems = [];
    for (const file of files) {
      try {
        const metadata = await loadVideoMetadata(file);
        metadata.flag = 'flagged'; // Default flag is 'flagged' (Pick) upon import
        registerRuntimeFile(metadata.id, file);
        newItems.push(metadata);
      } catch (err) {
        console.error('Failed to load metadata for file:', file.name, err);
      }
    }

    if (newItems.length === 0) return;

    const firstFileName = newItems[0].name.replace(/\.[^/.]+$/, '');
    const sessionName = newItems.length === 1 
      ? `Import: ${firstFileName}` 
      : `Batch Import (${newItems.length} clips) — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Create a brand new session for this import! (Requirement: "Each import should be a session")
    const newSession = createNewSession(sessionName);
    newSession.items = newItems;
    newSession.activeItemId = newItems[0].id;
    const saved = await saveSession(newSession);

    setCurrentSession(saved);
    setQueue(newItems);
    setActiveItemId(newItems[0].id);

    const all = await getAllSessions();
    setSessions(all);
    setToastNotification(`Created session: "${sessionName}" (${newItems.length} clips)`);
    setTimeout(() => setToastNotification(null), 3000);
  };

  // Switch session
  const handleSelectSession = async (sessionId) => {
    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      isLoadingSessionRef.current = true;

      const session = await getSessionById(sessionId);
      if (session) {
        const hydratedItems = (session.items || []).map(item => ({
          ...item,
          file: getRuntimeFile(item.id) || item.file || null,
        }));

        latestStateRef.current = {
          currentSession: session,
          queue: hydratedItems,
          activeItemId: session.activeItemId || (hydratedItems[0]?.id) || null
        };

        setCurrentSession(session);
        setQueue(hydratedItems);
        setActiveItemId(session.activeItemId || (hydratedItems[0]?.id) || null);
        setLastActiveSessionId(session.id);
      }
    } catch (err) {
      console.error('Failed to select session:', err);
    }
  };

  // Create new session: resets workspace ready for a fresh import (Don't create a session until import)
  const handleCreateNewSession = () => {
    setCurrentSession(null);
    setQueue([]);
    setActiveItemId(null);
    clearLastActiveSessionId();
    latestStateRef.current = {
      currentSession: null,
      queue: [],
      activeItemId: null
    };
    setSessionModalOpen(false);
    setToastNotification('Workspace ready. Import videos to create a session.');
    setTimeout(() => setToastNotification(null), 3000);
  };

  // Delete session
  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      const remaining = await getAllSessions();
      setSessions(remaining);

      if (currentSession?.id === sessionId) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0].id);
        } else {
          // If no sessions remain: Don't create a phantom session!
          setCurrentSession(null);
          setQueue([]);
          setActiveItemId(null);
          clearLastActiveSessionId();
          latestStateRef.current = {
            currentSession: null,
            queue: [],
            activeItemId: null
          };
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // Rename session
  const handleRenameSession = async (sessionId, newName) => {
    try {
      const session = await getSessionById(sessionId);
      if (session) {
        session.name = newName;
        await saveSession(session);
        if (currentSession?.id === sessionId) {
          setCurrentSession(prev => ({ ...prev, name: newName }));
        }
        const all = await getAllSessions();
        setSessions(all);
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  // Lightroom Flag Handler (Z = Pick / In Queue, X = Reject / Out of Queue, U = Unflag)
  const handleSetFlag = (itemId, flagType) => {
    const updatedQueue = queue.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          flag: flagType
        };
      }
      return item;
    });
    setQueue(updatedQueue);

    let nextId = activeItemId;
    // When flagging rejected (X) on active clip, automatically jump to next video!
    if (flagType === 'rejected' && activeItemId === itemId) {
      const idx = queue.findIndex(i => i.id === itemId);
      if (idx >= 0 && idx < queue.length - 1) {
        nextId = queue[idx + 1].id;
        setActiveItemId(nextId);
      }
    }

    if (currentSession) {
      persistCurrentState(currentSession, updatedQueue, nextId);
    }
  };

  // Purge Rejected clips
  const handlePurgeRejected = () => {
    const remaining = queue.filter(item => item.flag !== 'rejected');
    const newActiveId = remaining.some(i => i.id === activeItemId) 
      ? activeItemId 
      : (remaining[0]?.id || null);
    setQueue(remaining);
    setActiveItemId(newActiveId);
    if (currentSession) {
      if (remaining.length === 0) {
        deleteSession(currentSession.id).then(async () => {
          clearLastActiveSessionId();
          setCurrentSession(null);
          const all = await getAllSessions();
          setSessions(all);
        });
      } else {
        persistCurrentState(currentSession, remaining, newActiveId);
      }
    }
  };

  // Flag all as picks
  const handleFlagAllPicks = () => {
    const updated = queue.map(item => ({ ...item, flag: 'flagged' }));
    setQueue(updated);
    if (currentSession) {
      persistCurrentState(currentSession, updated, activeItemId);
    }
  };

  // Pin or toggle frame timestamp for a video (supports multiple pins)
  const handlePinFrame = (itemId, timestamp) => {
    const updated = queue.map(item => {
      if (item.id === itemId) {
        const currentPins = Array.isArray(item.pinnedTimestamps)
          ? [...item.pinnedTimestamps]
          : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);

        const existingIdx = currentPins.findIndex(t => Math.abs(t - timestamp) < 0.15);
        let nextPins;
        if (existingIdx >= 0) {
          // Unpin if clicking at existing pin timecode
          nextPins = currentPins.filter((_, i) => i !== existingIdx);
        } else {
          // Add new pin and keep sorted chronologically
          nextPins = [...currentPins, timestamp].sort((a, b) => a - b);
        }

        const primaryTime = nextPins.length > 0 ? (existingIdx >= 0 ? nextPins[0] : timestamp) : null;

        return {
          ...item,
          pinnedTimestamps: nextPins,
          selectedTimestamp: primaryTime,
          flag: item.flag === 'rejected' && nextPins.length > 0 ? 'flagged' : item.flag, // auto-unreject when pinning
          status: nextPins.length > 0 ? 'ready' : 'pending'
        };
      }
      return item;
    });
    setQueue(updated);
    if (currentSession) {
      persistCurrentState(currentSession, updated, activeItemId);
    }
  };

  // Remove a specific pin from an item
  const handleRemovePin = (itemId, timestampToRemove) => {
    const updated = queue.map(item => {
      if (item.id === itemId) {
        const currentPins = Array.isArray(item.pinnedTimestamps)
          ? item.pinnedTimestamps.filter(t => Math.abs(t - timestampToRemove) > 0.05)
          : [];

        return {
          ...item,
          pinnedTimestamps: currentPins,
          selectedTimestamp: currentPins.length > 0 ? currentPins[0] : null,
          status: currentPins.length > 0 ? 'ready' : 'pending'
        };
      }
      return item;
    });
    setQueue(updated);
    if (currentSession) {
      persistCurrentState(currentSession, updated, activeItemId);
    }
  };

  // Clear all pins for an item
  const handleClearAllPins = (itemId) => {
    const updated = queue.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          pinnedTimestamps: [],
          selectedTimestamp: null,
          status: 'pending'
        };
      }
      return item;
    });
    setQueue(updated);
    if (currentSession) {
      persistCurrentState(currentSession, updated, activeItemId);
    }
  };

  // Toggle Color Space Transform (CST: S-Log3 -> Rec.709) for a video clip
  const handleToggleCST = (itemId) => {
    const updated = queue.map(item => {
      if (item.id === itemId) {
        const nextEnabled = !item.cstEnabled;
        return {
          ...item,
          cstEnabled: nextEnabled,
        };
      }
      return item;
    });
    setQueue(updated);
    if (currentSession) {
      persistCurrentState(currentSession, updated, activeItemId);
    }
  };

  // Remove single item from queue
  const handleRemoveItem = (itemId) => {
    const remaining = queue.filter(item => item.id !== itemId);
    const newActiveId = activeItemId === itemId ? (remaining[0]?.id || null) : activeItemId;
    setQueue(remaining);
    setActiveItemId(newActiveId);
    if (currentSession) {
      if (remaining.length === 0) {
        deleteSession(currentSession.id).then(async () => {
          clearLastActiveSessionId();
          setCurrentSession(null);
          const all = await getAllSessions();
          setSessions(all);
        });
      } else {
        persistCurrentState(currentSession, remaining, newActiveId);
      }
    }
  };

  // Clear entire queue
  const handleClearQueue = async () => {
    setQueue([]);
    setActiveItemId(null);
    latestStateRef.current = {
      currentSession: null,
      queue: [],
      activeItemId: null
    };
    if (currentSession?.id) {
      try {
        await deleteSession(currentSession.id);
        clearLastActiveSessionId();
        setCurrentSession(null);
        const remaining = await getAllSessions();
        setSessions(remaining);
      } catch (e) {
        console.warn('Error clearing session:', e);
      }
    } else {
      setCurrentSession(null);
      clearLastActiveSessionId();
    }
  };

  // Clear completed items
  const handleClearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== 'exported'));
  };

  // Open single frame preview
  const handleExportSingleFrame = (item, frameData) => {
    setPreviewModal({
      isOpen: true,
      item,
      frameData
    });
  };

  // Batch export finished callback
  const handleExportFinished = (exportedIds) => {
    setQueue(prev => prev.map(item => {
      if (exportedIds.includes(item.id)) {
        return { ...item, status: 'exported' };
      }
      return item;
    }));
  };

  // Queue navigation
  const handlePrevVideo = useCallback(() => {
    setQueue(currentQueue => {
      setActiveItemId(currentId => {
        const idx = currentQueue.findIndex(i => i.id === currentId);
        if (idx > 0) return currentQueue[idx - 1].id;
        return currentId;
      });
      return currentQueue;
    });
  }, []);

  const handleNextVideo = useCallback(() => {
    setQueue(currentQueue => {
      setActiveItemId(currentId => {
        const idx = currentQueue.findIndex(i => i.id === currentId);
        if (idx >= 0 && idx < currentQueue.length - 1) {
          return currentQueue[idx + 1].id;
        }
        return currentId;
      });
      return currentQueue;
    });
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setPreviewModal(prev => ({ ...prev, isOpen: false }));
        setBatchModalOpen(false);
        setShortcutsModalOpen(false);
        setSessionModalOpen(false);
      } else if (e.key === 'ArrowUp' || e.key === '[') {
        e.preventDefault();
        handlePrevVideo();
      } else if (e.key === 'ArrowDown' || e.key === ']') {
        e.preventDefault();
        handleNextVideo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevVideo, handleNextVideo]);

  // Global Drag and Drop handlers for entire window
  const handleWindowDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWindowDragOver(true);
  };

  const handleWindowDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsWindowDragOver(false);
    }
  };

  const handleWindowDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWindowDragOver(false);

    const items = e.dataTransfer.items;
    const files = [];

    if (items) {
      const entryPromises = [];
      const readEntry = async (entry) => {
        if (entry.isFile) {
          return new Promise((resolve) => {
            entry.file((file) => {
              if (file && (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi|flv|wmv|ts)$/i.test(file.name))) {
                files.push(file);
              }
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
              for (const childEntry of entries) {
                await readEntry(childEntry);
              }
              resolve();
            });
          });
        }
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) entryPromises.push(readEntry(entry));
        } else {
          const file = item.getAsFile();
          if (file && (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name))) {
            files.push(file);
          }
        }
      }

      await Promise.all(entryPromises);
    } else if (e.dataTransfer.files) {
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name)) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      handleFilesSelected(files);
    }
  };

  return (
    <div 
      className="app-container"
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      {/* Hidden File and Folder Inputs */}
      <input 
        type="file" 
        ref={fileInputRef}
        multiple 
        accept="video/*,.mkv,.mp4,.mov,.webm,.m4v,.avi" 
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFilesSelected(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <input 
        type="file" 
        ref={folderInputRef}
        webkitdirectory="true"
        directory="true"
        multiple 
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFilesSelected(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {/* Main Header with Session Switcher */}
      <Header 
        currentSession={currentSession}
        sessions={sessions}
        onOpenSessionModal={() => setSessionModalOpen(true)}
        onCreateNewSession={handleCreateNewSession}
        queue={queue}
        onOpenFileInput={() => fileInputRef.current?.click()}
        onOpenFolderInput={() => folderInputRef.current?.click()}
        onOpenRelinkFolder={() => folderInputRef.current?.click()}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onStartBatchExport={() => setBatchModalOpen(true)}
      />

      {/* App Workspace */}
      <main className="app-workspace">
        {queue.length === 0 ? (
          <div className="empty-workspace-view">
            <ImportDropZone 
              onFilesSelected={handleFilesSelected}
              hasItems={false}
            />
          </div>
        ) : (
          <div className="studio-layout">
            {/* Left: Queue Manager Sidebar with Lightroom Flags */}
            <QueueManager 
              queue={queue}
              activeItemId={activeItemId}
              onSelectItem={(id) => setActiveItemId(id)}
              onRemoveItem={handleRemoveItem}
              onClearQueue={handleClearQueue}
              onClearCompleted={handleClearCompleted}
              onSetFlag={handleSetFlag}
              onPurgeRejected={handlePurgeRejected}
              onFlagAllPicks={handleFlagAllPicks}
              onToggleCST={handleToggleCST}
            />

            {/* Right: Main Video Player Studio */}
            <section className="studio-player-section">
              {activeItem ? (
                <VideoPlayer 
                  activeItem={activeItem}
                  onPinFrame={handlePinFrame}
                  onSetFlag={handleSetFlag}
                  onExportSingleFrame={handleExportSingleFrame}
                  onPrevVideo={handlePrevVideo}
                  onNextVideo={handleNextVideo}
                  hasPrevVideo={activeIndex > 0}
                  hasNextVideo={activeIndex < queue.length - 1}
                  currentIndex={activeIndex}
                  totalVideos={queue.length}
                  onRelinkFiles={handleRelinkFiles}
                  onRemovePin={handleRemovePin}
                  onClearAllPins={handleClearAllPins}
                  onToggleCST={handleToggleCST}
                />
              ) : (
                <div className="no-active-video">
                  Select a video from the queue to start extracting frames
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Global Toast Notification */}
      {toastNotification && (
        <div className="global-toast-notification">
          <CheckCircle2 size={16} className="text-cyan" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* Global Drag and Drop Overlay */}
      {isWindowDragOver && (
        <div className="window-drag-overlay">
          <div className="window-drag-card">
            <UploadCloud size={54} className="text-cyan animate-bounce" />
            <h2>Drop High-Res Videos or Folders</h2>
            <p>Creates/adds to an independent saved session automatically</p>
          </div>
        </div>
      )}

      {/* Session Manager Modal */}
      <SessionManagerModal 
        isOpen={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        sessions={sessions}
        activeSessionId={currentSession?.id}
        onSelectSession={handleSelectSession}
        onCreateNewSession={handleCreateNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      {/* Frame Preview Modal */}
      <FramePreviewModal 
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
        activeItem={previewModal.item}
        frameData={previewModal.frameData}
      />

      {/* Batch Export Modal */}
      <ExportProgressModal 
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        queue={queue}
        onExportFinished={handleExportFinished}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal 
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  );
}
