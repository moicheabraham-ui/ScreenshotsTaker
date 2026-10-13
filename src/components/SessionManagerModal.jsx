import React, { useState } from 'react';
import { 
  X, 
  FolderKanban, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Film, 
  Pin, 
  Flag, 
  Ban, 
  HardDrive,
  Edit2,
  Check,
  Play
} from 'lucide-react';
import { formatBytes } from '../utils/videoProcessor';

export function SessionManagerModal({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewSession,
  onDeleteSession,
  onRenameSession
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  if (!isOpen) return null;

  const startRename = (session, e) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingName(session.name);
  };

  const saveRename = (sessionId, e) => {
    e.stopPropagation();
    if (editingName.trim()) {
      onRenameSession(sessionId, editingName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (sessionId, e) => {
    if (e.key === 'Enter') {
      saveRename(sessionId, e);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleDelete = (sessionId, e) => {
    e.stopPropagation();
    if (deleteConfirmId === sessionId) {
      onDeleteSession(sessionId);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(sessionId);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <FolderKanban size={20} className="text-cyan" />
            <h3 className="modal-title">Saved Import Sessions</h3>
            <span className="modal-res-badge">
              {sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}
            </span>
          </div>

          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body session-modal-body">
          <div className="session-top-controls">
            <p className="session-modal-intro">
              Each import is saved as an independent session with its videos, pinned frames, and Lightroom flags (Z/X). Switch between sessions or resume later.
            </p>

            <button className="btn-primary" onClick={onCreateNewSession} title="Start fresh workspace: a new session will be created once videos are imported">
              <Plus size={16} />
              <span>New Import Workspace</span>
            </button>
          </div>

          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="session-empty-state">
                <FolderKanban size={36} className="text-muted" />
                <p>No saved sessions yet. Import videos to automatically create your first session!</p>
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const dateStr = new Date(session.updatedAt || session.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div 
                    key={session.id}
                    className={`session-card ${isActive ? 'active-session-card' : ''}`}
                    onClick={() => {
                      if (!isActive) {
                        onSelectSession(session.id);
                      }
                      onClose();
                    }}
                  >
                    <div className="session-card-header">
                      <div className="session-name-group">
                        {editingId === session.id ? (
                          <div className="rename-input-row" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="text" 
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(session.id, e)}
                              className="rename-input"
                              autoFocus
                            />
                            <button 
                              className="btn-icon-subtle text-emerald"
                              onClick={(e) => saveRename(session.id, e)}
                              title="Save name"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="session-title-display">
                            <h4 className="session-title">{session.name}</h4>
                            <button 
                              className="btn-icon-subtle-sm"
                              onClick={(e) => startRename(session, e)}
                              title="Rename session"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}

                        <div className="session-date-row">
                          <Clock size={12} className="text-muted" />
                          <span>Last updated {dateStr}</span>
                        </div>
                      </div>

                      {isActive && (
                        <div className="active-session-pill">
                          <CheckCircle2 size={13} className="text-cyan" />
                          <span>ACTIVE SESSION</span>
                        </div>
                      )}
                    </div>

                    {/* Session Metrics Bar */}
                    <div className="session-metrics-row">
                      <div className="session-metric" title="Total clips">
                        <Film size={13} className="text-muted" />
                        <span>{session.totalVideos || (session.items ? session.items.length : 0)} Clips</span>
                      </div>

                      <div className="session-metric" title="Pinned frames">
                        <Pin size={13} className="text-emerald" />
                        <span className="text-emerald">{session.pinnedCount || 0} Pinned</span>
                      </div>

                      <div className="session-metric" title="Lightroom Pick flags (Z)">
                        <Flag size={13} className="text-cyan" />
                        <span className="text-cyan">{session.flaggedCount || 0} Picks (Z)</span>
                      </div>

                      {session.rejectedCount > 0 && (
                        <div className="session-metric" title="Lightroom Rejected flags (X)">
                          <Ban size={13} className="text-rose" />
                          <span className="text-danger">{session.rejectedCount} Rejected (X)</span>
                        </div>
                      )}

                      <div className="session-metric" title="Total file size">
                        <HardDrive size={13} className="text-purple" />
                        <span>{formatBytes(session.totalSizeBytes || 0)}</span>
                      </div>
                    </div>

                    {/* Session Card Actions */}
                    <div className="session-card-actions" onClick={(e) => e.stopPropagation()}>
                      {!isActive ? (
                        <button 
                          className="btn-secondary"
                          onClick={() => {
                            onSelectSession(session.id);
                            onClose();
                          }}
                        >
                          <Play size={14} />
                          <span>Resume Session</span>
                        </button>
                      ) : (
                        <span className="current-session-label">Currently Open</span>
                      )}

                      <button 
                        className={`btn-ghost-sm ${deleteConfirmId === session.id ? 'delete-confirm-active' : 'text-danger'}`}
                        onClick={(e) => handleDelete(session.id, e)}
                        title={deleteConfirmId === session.id ? 'Click again to confirm delete' : 'Delete session'}
                      >
                        <Trash2 size={13} />
                        <span>{deleteConfirmId === session.id ? 'Confirm Delete?' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
