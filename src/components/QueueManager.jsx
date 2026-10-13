import React, { useState } from 'react';
import { 
  Film, 
  Trash2, 
  Check, 
  Clock, 
  Layers, 
  Search,
  Flag,
  Ban,
  AlertCircle,
  Palette
} from 'lucide-react';
import { formatTime, formatBytes } from '../utils/videoProcessor';

export function QueueManager({
  queue,
  activeItemId,
  onSelectItem,
  onRemoveItem,
  onClearQueue,
  onClearCompleted,
  onSetFlag,
  onPurgeRejected,
  onFlagAllPicks,
  onToggleCST
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'flagged' | 'unflagged' | 'rejected' | 'pinned'
  const [searchQuery, setSearchQuery] = useState('');

  const flaggedCount = queue.filter(item => item.flag === 'flagged').length;
  const rejectedCount = queue.filter(item => item.flag === 'rejected').length;
  const unflaggedCount = queue.filter(item => !item.flag || item.flag === 'unflagged').length;
  const totalPinsCount = queue.reduce((acc, item) => {
    const pins = Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0
      ? item.pinnedTimestamps
      : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);
    return acc + pins.length;
  }, 0);
  const exportedCount = queue.filter(item => item.status === 'exported').length;
  const slogCount = queue.filter(item => item.isSLogDetected || item.cstEnabled).length;

  const filteredQueue = queue.filter(item => {
    // Search query filter
    if (searchQuery.trim() !== '') {
      const match = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!match) return false;
    }

    // Status / Flag filter
    if (filter === 'flagged') return item.flag === 'flagged';
    if (filter === 'rejected') return item.flag === 'rejected';
    if (filter === 'unflagged') return !item.flag || item.flag === 'unflagged';
    if (filter === 'slog') return item.isSLogDetected || item.cstEnabled;
    if (filter === 'pinned') {
      return (Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0) ||
        (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined);
    }
    if (filter === 'exported') return item.status === 'exported';
    return true;
  });

  const cycleFlag = (item, e) => {
    e.stopPropagation();
    const current = item.flag || 'unflagged';
    if (current === 'unflagged') onSetFlag(item.id, 'flagged');
    else if (current === 'flagged') onSetFlag(item.id, 'rejected');
    else onSetFlag(item.id, 'unflagged');
  };

  return (
    <aside className="queue-manager-panel">
      {/* Queue Header & Stats */}
      <div className="queue-panel-header">
        <div className="queue-header-title-row">
          <div className="queue-title-badge">
            <Layers size={16} className="text-cyan" />
            <h3 className="queue-panel-title">Video Queue</h3>
            <span className="queue-count-pill">{queue.length}</span>
          </div>

          <div className="queue-bulk-menu">
            {rejectedCount > 0 && (
              <button 
                className="btn-ghost-sm text-danger" 
                onClick={onPurgeRejected}
                title="Remove all Rejected (X) videos from queue"
              >
                <Ban size={12} />
                <span>Purge ({rejectedCount})</span>
              </button>
            )}

            <button 
              className="btn-ghost-sm text-danger" 
              onClick={onClearQueue}
              title="Remove all videos from queue"
              disabled={queue.length === 0}
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="queue-filter-row">
          <div className="queue-search-box">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search clips..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="queue-search-input"
            />
          </div>

          {/* Lightroom Flag Filter Bar */}
          <div className="queue-filter-chips">
            <button 
              className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              title="All clips"
            >
              All ({queue.length})
            </button>

            <button 
              className={`filter-chip flag-filter-chip ${filter === 'flagged' ? 'active' : ''}`}
              onClick={() => setFilter('flagged')}
              title="Lightroom Picks (Z)"
            >
              <Flag size={11} className={filter === 'flagged' ? 'text-cyan' : ''} />
              <span>Picks ({flaggedCount})</span>
            </button>

            <button 
              className={`filter-chip ${filter === 'unflagged' ? 'active' : ''}`}
              onClick={() => setFilter('unflagged')}
              title="Unflagged clips"
            >
              Unflagged ({unflaggedCount})
            </button>

            <button 
              className={`filter-chip reject-filter-chip ${filter === 'rejected' ? 'active' : ''}`}
              onClick={() => setFilter('rejected')}
              title="Rejected clips (X)"
            >
              <Ban size={11} className={filter === 'rejected' ? 'text-rose' : ''} />
              <span>Reject ({rejectedCount})</span>
            </button>

            {slogCount > 0 && (
              <button 
                className={`filter-chip ${filter === 'slog' ? 'active' : ''}`}
                onClick={() => setFilter('slog')}
                title="Clips with S-Log3 detected or CST enabled"
              >
                <Palette size={11} className={filter === 'slog' ? 'text-cyan' : ''} />
                <span>S-Log ({slogCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Queue List Items Container */}
      <div className="queue-items-scrollable">
        {filteredQueue.length === 0 ? (
          <div className="queue-empty-state">
            <AlertCircle size={26} className="text-muted" />
            <p>No clips match the selected filter</p>
          </div>
        ) : (
          filteredQueue.map((item) => {
            const isActive = item.id === activeItemId;
            const pins = Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0
              ? item.pinnedTimestamps
              : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);
            const isPinned = pins.length > 0;
            const isExported = item.status === 'exported';
            const flag = item.flag || 'unflagged';

            return (
              <div 
                key={item.id}
                className={`queue-card ${isActive ? 'active-card' : ''} ${flag === 'flagged' ? 'flagged-pick-card' : ''} ${flag === 'rejected' ? 'rejected-card' : ''}`}
                onClick={() => onSelectItem(item.id)}
              >
                {/* Thumbnail Preview Box */}
                <div className="card-thumb-wrapper">
                  {item.thumbnailUrl ? (
                    <img 
                      src={item.thumbnailUrl} 
                      alt={item.name} 
                      className="card-thumb-img" 
                      loading="lazy"
                    />
                  ) : (
                    <div className="card-thumb-placeholder">
                      <Film size={20} className="text-muted" />
                    </div>
                  )}

                  {/* Lightroom Flag Overlay Button */}
                  <button 
                    className={`card-flag-btn ${flag}`}
                    onClick={(e) => cycleFlag(item, e)}
                    title={
                      flag === 'flagged' ? 'Flagged as Pick (Z). Click to reject.' :
                      flag === 'rejected' ? 'Rejected (X). Click to unflag.' :
                      'Unflagged. Click to flag as Pick (Z).'
                    }
                  >
                    {flag === 'flagged' && <Flag size={11} fill="currentColor" />}
                    {flag === 'rejected' && <Ban size={11} />}
                    {flag === 'unflagged' && <Flag size={11} className="flag-ghost" />}
                  </button>

                  {/* Resolution chip overlay */}
                  <span className="card-res-chip">
                    {item.resolutionBadge}
                  </span>

                  {/* Duration chip */}
                  <span className="card-duration-chip">
                    {formatTime(item.duration).split('.')[0]}
                  </span>
                </div>

                {/* Metadata & Status */}
                <div className="card-content">
                  <div className="card-title-row">
                    <h4 className={`card-title ${flag === 'rejected' ? 'strikethrough-text' : ''}`} title={item.name}>
                      {item.name}
                    </h4>
                    <span className="card-size-text">
                      {formatBytes(item.size)}
                    </span>
                  </div>

                  <div className="card-status-row">
                    {/* Lightroom Flag badge */}
                    {flag === 'flagged' && (
                      <span className="flag-badge-pill pick" title="Flagged Pick for Queue (Z)">
                        <Flag size={10} fill="currentColor" />
                        <span>PICK (Z)</span>
                      </span>
                    )}

                    {flag === 'rejected' && (
                      <span className="flag-badge-pill reject" title="Rejected from Queue (X)">
                        <Ban size={10} />
                        <span>REJECT (X)</span>
                      </span>
                    )}

                    {isPinned ? (
                      <div className="status-pill pinned" title={`${pins.length} pinned frame${pins.length > 1 ? 's' : ''}`}>
                        <Check size={11} className="text-emerald" />
                        <span>{pins.length > 1 ? `${pins.length} Frames` : formatTime(pins[0])}</span>
                      </div>
                    ) : (
                      <div className="status-pill pending" title="No frame selected yet">
                        <Clock size={11} className="text-amber" />
                        <span>Needs Frame</span>
                      </div>
                    )}

                    {/* Color Space Transform (CST) Pill */}
                    {item.cstEnabled ? (
                      <button
                        type="button"
                        className="status-pill cst-pill active"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleCST) onToggleCST(item.id);
                        }}
                        title="CST Active: S-Log3 mapped to Rec.709. Click to toggle."
                      >
                        <Palette size={10} className="text-cyan" />
                        <span>CST Rec.709</span>
                      </button>
                    ) : item.isSLogDetected ? (
                      <button
                        type="button"
                        className="status-pill cst-pill raw"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleCST) onToggleCST(item.id);
                        }}
                        title="S-Log3 detected (CST currently off). Click to enable Rec.709."
                      >
                        <Palette size={10} className="text-muted" />
                        <span>S-Log (Raw)</span>
                      </button>
                    ) : null}

                    {isExported && (
                      <span className="status-pill exported">
                        Exported
                      </span>
                    )}

                    {!item.file && (
                      <span className="status-pill offline" title="Video file handle detached. Click Re-link to reconnect media.">
                        <AlertCircle size={10} className="text-amber" />
                        <span>Offline</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Quick Actions */}
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className="card-action-btn delete-btn"
                    onClick={() => onRemoveItem(item.id)}
                    title="Remove from queue"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Queue Footer Action Bar */}
      <div className="queue-panel-footer">
        <div className="queue-stats-summary">
          <span className="queue-summary-label">Queue Ready:</span>
          <span className="queue-summary-ratio">
            <strong>{flaggedCount > 0 ? flaggedCount : totalPinsCount}</strong> {flaggedCount > 0 ? 'picks' : 'frames'} ready for export
          </span>
        </div>

        {exportedCount > 0 && (
          <button 
            className="btn-ghost-sm"
            onClick={onClearCompleted}
            title="Remove already exported clips"
          >
            Clear Exported ({exportedCount})
          </button>
        )}
      </div>
    </aside>
  );
}
