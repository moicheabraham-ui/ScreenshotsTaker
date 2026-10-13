import React from 'react';
import { 
  Film, 
  FolderPlus, 
  Upload, 
  Download, 
  Keyboard, 
  Cpu, 
  HardDrive, 
  CheckCircle2, 
  FolderKanban,
  Flag,
  Plus
} from 'lucide-react';
import { formatBytes } from '../utils/videoProcessor';

export function Header({
  currentSession,
  sessions,
  onOpenSessionModal,
  onCreateNewSession,
  queue,
  onOpenFileInput,
  onOpenFolderInput,
  onOpenRelinkFolder,
  onOpenShortcuts,
  onStartBatchExport,
  isExporting
}) {
  const totalVideos = queue.length;
  const totalPinsCount = queue.reduce((acc, item) => {
    const pins = Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0
      ? item.pinnedTimestamps
      : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);
    return acc + pins.length;
  }, 0);
  const flaggedCount = queue.filter(item => item.flag === 'flagged').length;
  const totalSizeBytes = queue.reduce((acc, item) => acc + (item.size || 0), 0);

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo-glow">
          <div className="brand-icon-wrapper">
            <Film className="brand-icon" size={20} />
          </div>
        </div>
        <div className="brand-text">
          <div className="brand-title-row">
            <h1 className="brand-title">FrameForge <span className="brand-badge-4k">4K PRO</span></h1>
            {/* Session Selector Chip */}
            <button 
              className="session-selector-chip"
              onClick={onOpenSessionModal}
              title="Manage and switch saved import sessions"
            >
              <FolderKanban size={13} className="text-cyan" />
              <span className="session-name-text">
                {currentSession?.name || 'No Active Session'}
              </span>
              <span className="session-count-tag" title={`${sessions.length} Saved Sessions`}>
                {sessions.length}
              </span>
            </button>
          </div>
          <p className="brand-subtitle">High-Resolution Bulk Video Frame Extractor & Batch Queue</p>
        </div>
      </div>

      <div className="header-metrics">
        {/* Lightroom Flag Metric */}
        <div className="metric-pill" title="Videos flagged as Pick (Z) for export">
          <Flag size={14} className="metric-icon text-cyan" />
          <div className="metric-content">
            <span className="metric-label">Picks (Z)</span>
            <span className="metric-value text-cyan">{flaggedCount} <span className="metric-sub">/ {totalVideos}</span></span>
          </div>
        </div>

        {/* Pinned Frames Metric */}
        <div className="metric-pill" title="Total pinned frames queued for export">
          <CheckCircle2 size={14} className="metric-icon text-emerald" />
          <div className="metric-content">
            <span className="metric-label">Pinned</span>
            <span className="metric-value text-emerald">{totalPinsCount} <span className="metric-sub">frames</span></span>
          </div>
        </div>

        <div className="metric-pill" title="Total imported heavy clips">
          <HardDrive size={14} className="metric-icon text-purple" />
          <div className="metric-content">
            <span className="metric-label">Size</span>
            <span className="metric-value">{formatBytes(totalSizeBytes)}</span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {queue.some(item => !item.file) && (
          <button 
            className="btn-relink-pill"
            onClick={onOpenFolderInput}
            title="Media offline: Select your video folder to re-link all matching clips"
          >
            <FolderPlus size={14} className="text-amber animate-pulse" />
            <span>Re-link Folder</span>
          </button>
        )}

        <button 
          className="btn-ghost-sm"
          onClick={onCreateNewSession}
          title="Start fresh workspace for your next import"
        >
          <Plus size={15} />
          <span>New Session</span>
        </button>

        <button 
          className="btn-ghost" 
          onClick={onOpenShortcuts}
          title="View Keyboard Shortcuts (?)"
        >
          <Keyboard size={15} />
          <span>Shortcuts</span>
        </button>

        <div className="import-btn-group">
          <button 
            className="btn-secondary" 
            onClick={onOpenFolderInput}
            title="Import folder with videos (creates new session)"
          >
            <FolderPlus size={15} />
            <span>Add Folder</span>
          </button>

          <button 
            className="btn-secondary" 
            onClick={onOpenFileInput}
            title="Import video files (creates new session)"
          >
            <Upload size={15} />
            <span>Import Videos</span>
          </button>
        </div>

        <button 
          className="btn-primary glow-button"
          onClick={onStartBatchExport}
          disabled={totalVideos === 0 || isExporting}
          title="Batch export selected frames as ZIP or individual files"
        >
          <Download size={16} />
          <span>Export Queue</span>
          {flaggedCount > 0 ? (
            <span className="btn-count-badge" title={`${flaggedCount} Flagged Picks`}>{flaggedCount}</span>
          ) : totalPinsCount > 0 ? (
            <span className="btn-count-badge" title={`${totalPinsCount} Pinned Frames`}>{totalPinsCount}</span>
          ) : null}
        </button>
      </div>
    </header>
  );
}
