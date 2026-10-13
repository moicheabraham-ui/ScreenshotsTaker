import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  Pin, 
  Check, 
  Camera, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Gauge, 
  Eye, 
  Sparkles,
  Target,
  Flag,
  Ban,
  Undo2,
  HardDrive,
  FolderPlus,
  Upload,
  X,
  Palette
} from 'lucide-react';
import { 
  formatTime, 
  formatSMPTE, 
  getResolutionBadge, 
  captureFrameFromVideoElement,
  formatBytes 
} from '../utils/videoProcessor';
import { SVG_TABLE_VALUES } from '../utils/colorSpaceTransform';

export function VideoPlayer({
  activeItem,
  onPinFrame,
  onSetFlag,
  onExportSingleFrame,
  onPrevVideo,
  onNextVideo,
  hasPrevVideo,
  hasNextVideo,
  currentIndex,
  totalVideos,
  onRelinkFiles,
  onRemovePin,
  onClearAllPins,
  onToggleCST
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const scrubberRef = useRef(null);
  const relinkFileInputRef = useRef(null);
  const relinkFolderInputRef = useRef(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(activeItem?.duration || 0);
  const [videoDimensions, setVideoDimensions] = useState({ 
    width: activeItem?.width || 0, 
    height: activeItem?.height || 0 
  });
  const [fps, setFps] = useState(activeItem?.fps || 30);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(true);

  // Zoom / Pixel Inspector state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  // Hover scrub state
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  // URL management
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPinAnimActive, setIsPinAnimActive] = useState(false);
  const [flagToast, setFlagToast] = useState(null); // { text, type: 'flagged' | 'rejected' | 'unflagged' }

  // Setup video object URL when activeItem changes
  useEffect(() => {
    if (!activeItem || !activeItem.file) {
      setVideoSrc(null);
      return;
    }

    const url = URL.createObjectURL(activeItem.file);
    setVideoSrc(url);
    setIsPlaying(false);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeItem?.id]);

  // Sync video element attributes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setVideoDimensions({
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080
      });

      if (activeItem?.selectedTimestamp !== undefined && activeItem?.selectedTimestamp !== null) {
        video.currentTime = activeItem.selectedTimestamp;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [activeItem]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Frame Stepping
  const stepFrame = useCallback((frameDelta) => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setIsPlaying(false);

    const frameDuration = 1 / fps;
    const newTime = Math.min(video.duration, Math.max(0, video.currentTime + frameDelta * frameDuration));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [fps]);

  // Time Stepping in seconds
  const stepSeconds = useCallback((secDelta) => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setIsPlaying(false);

    const newTime = Math.min(video.duration, Math.max(0, video.currentTime + secDelta));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  // Jump to specific time
  const seekTo = (time) => {
    const video = videoRef.current;
    if (!video) return;

    const validTime = Math.min(duration, Math.max(0, time));
    video.currentTime = validTime;
    setCurrentTime(validTime);
  };

  // Flag action handler (Lightroom style Z & X)
  const triggerFlag = useCallback((flagType) => {
    if (!activeItem) return;

    onSetFlag(activeItem.id, flagType);

    if (flagType === 'rejected') {
      setFlagToast({ text: 'REJECTED (X) → JUMPING NEXT', type: 'rejected' });
      setTimeout(() => setFlagToast(null), 1000);
    } else {
      let message = 'FLAGGED AS PICK (Z)';
      if (flagType === 'unflagged') message = 'UNFLAGGED (U)';
      setFlagToast({ text: message, type: flagType });
      setTimeout(() => setFlagToast(null), 1000);
    }
  }, [activeItem, onSetFlag]);

  // Pin or Toggle current frame for this video (supports multiple pins)
  const handlePinCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeItem) return;

    video.pause();
    setIsPlaying(false);

    setIsPinAnimActive(true);
    setTimeout(() => setIsPinAnimActive(false), 800);

    const pins = Array.isArray(activeItem?.pinnedTimestamps) && activeItem.pinnedTimestamps.length > 0
      ? activeItem.pinnedTimestamps
      : (activeItem?.selectedTimestamp !== undefined && activeItem?.selectedTimestamp !== null ? [activeItem.selectedTimestamp] : []);

    const isAlreadyPinned = pins.some(t => Math.abs(t - video.currentTime) < (0.5 / fps || 0.05));
    onPinFrame(activeItem.id, video.currentTime);

    if (isAlreadyPinned) {
      setFlagToast({ text: `PIN REMOVED at ${formatTime(video.currentTime)}`, type: 'unflagged' });
    } else {
      const newCount = pins.length + 1;
      setFlagToast({ text: `FRAME PINNED #${newCount} at ${formatTime(video.currentTime)}`, type: 'flagged' });
    }
    setTimeout(() => setFlagToast(null), 1200);
  }, [activeItem, onPinFrame, fps]);

  // Quick export active frame
  const handleExportNow = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !activeItem) return;

    video.pause();
    setIsPlaying(false);

    try {
      const frameData = await captureFrameFromVideoElement(video, 'image/png', 1.0, {
        cstEnabled: activeItem?.cstEnabled,
      });
      onExportSingleFrame(activeItem, frameData);
    } catch (err) {
      console.error('Frame capture error:', err);
    }
  }, [activeItem, onExportSingleFrame]);

  // Keyboard navigation within the player
  useEffect(() => {
    const handlePlayerKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) stepSeconds(-1);
        else stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) stepSeconds(1);
        else stepFrame(1);
      } else if (e.key === 'z' || e.key === 'Z') {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          triggerFlag('flagged');
        } else if (e.shiftKey) {
          // Shift + Z toggles zoom
          e.preventDefault();
          setZoomLevel(prev => (prev === 1 ? 2 : 1));
        }
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        triggerFlag('rejected');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        triggerFlag('unflagged');
      } else if (e.key === 's' || e.key === 'S' || e.key === 'Enter') {
        e.preventDefault();
        handlePinCurrentFrame();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleExportNow();
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          if (onToggleCST && activeItem) {
            onToggleCST(activeItem.id);
            const willBeEnabled = !activeItem.cstEnabled;
            setFlagToast({
              text: willBeEnabled ? 'CST ON: S-LOG3 → REC.709' : 'CST OFF: RAW S-LOG3',
              type: willBeEnabled ? 'flagged' : 'unflagged'
            });
            setTimeout(() => setFlagToast(null), 1200);
          }
        }
      } else if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const percent = Number(e.key) / 10;
        seekTo(duration * percent);
      }
    };

    window.addEventListener('keydown', handlePlayerKeyDown);
    return () => window.removeEventListener('keydown', handlePlayerKeyDown);
  }, [togglePlay, stepFrame, stepSeconds, duration, triggerFlag, handlePinCurrentFrame, handleExportNow, hasPrevVideo, onPrevVideo, hasNextVideo, onNextVideo]);

  // Scrubber click/drag handler
  const handleScrubberClick = (e) => {
    if (!scrubberRef.current || !duration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * duration);
  };

  const handleScrubberMouseMove = (e) => {
    if (!scrubberRef.current || !duration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const handleScrubberMouseLeave = () => {
    setHoverTime(null);
  };

  // Speed change
  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Zoom control
  const handleZoomChange = (newZoom) => {
    const clamped = Math.min(4, Math.max(1, newZoom));
    setZoomLevel(clamped);
    if (clamped === 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  };

  // Pan dragging
  const handleMouseDown = (e) => {
    if (zoomLevel <= 1) return;
    setIsDraggingPan(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: panOffset.x,
      initialOffsetY: panOffset.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingPan || zoomLevel <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: dragStartRef.current.initialOffsetX + dx,
      y: dragStartRef.current.initialOffsetY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingPan(false);
  };

  const pinnedTimestamps = Array.isArray(activeItem?.pinnedTimestamps) && activeItem.pinnedTimestamps.length > 0
    ? activeItem.pinnedTimestamps
    : (activeItem?.selectedTimestamp !== undefined && activeItem?.selectedTimestamp !== null ? [activeItem.selectedTimestamp] : []);
  const hasPinnedFrame = pinnedTimestamps.length > 0;
  const isCurrentFramePinned = pinnedTimestamps.some(t => Math.abs(t - currentTime) < (0.5 / fps || 0.05));

  const currentFrameNumber = Math.floor(currentTime * fps);
  const totalFrames = Math.floor(duration * fps);
  const resolutionBadge = getResolutionBadge(videoDimensions.width, videoDimensions.height);
  const currentFlag = activeItem?.flag || 'unflagged';

  return (
    <div className="video-player-studio" ref={containerRef} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Studio Top Control Strip */}
      <div className="studio-top-bar">
        <div className="studio-nav-buttons">
          <button 
            className="btn-icon-subtle" 
            onClick={onPrevVideo} 
            disabled={!hasPrevVideo}
            title="Previous Video in Queue ([)"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="active-video-info">
            <span className="queue-position-badge">
              CLIP {currentIndex + 1} OF {totalVideos}
            </span>
            <h2 className="active-video-name" title={activeItem?.name}>
              {activeItem?.name}
            </h2>
          </div>

          <button 
            className="btn-icon-subtle" 
            onClick={onNextVideo} 
            disabled={!hasNextVideo}
            title="Next Video in Queue (])"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Lightroom Flag Bar & Badges */}
        <div className="studio-meta-badges">
          {/* Lightroom Flag Selector Bar */}
          <div className="lightroom-flag-toolbar" title="Lightroom-Style Flagging: Z to Pick, X to Reject, U to Unflag">
            <button 
              className={`flag-tool-btn pick-btn ${currentFlag === 'flagged' ? 'active' : ''}`}
              onClick={() => triggerFlag(currentFlag === 'flagged' ? 'unflagged' : 'flagged')}
              title="Flag as Pick (Z) — Adds to export queue"
            >
              <Flag size={13} className={currentFlag === 'flagged' ? 'text-cyan' : ''} />
              <span>Pick</span>
              <kbd className="flag-keycap">Z</kbd>
            </button>

            <button 
              className={`flag-tool-btn reject-btn ${currentFlag === 'rejected' ? 'active' : ''}`}
              onClick={() => triggerFlag(currentFlag === 'rejected' ? 'unflagged' : 'rejected')}
              title="Flag as Rejected (X) — Excludes from export queue"
            >
              <Ban size={13} className={currentFlag === 'rejected' ? 'text-rose' : ''} />
              <span>Reject</span>
              <kbd className="flag-keycap">X</kbd>
            </button>

            {currentFlag !== 'unflagged' && (
              <button 
                className="flag-tool-btn unflag-btn"
                onClick={() => triggerFlag('unflagged')}
                title="Unflag (U)"
              >
                <Undo2 size={12} />
              </button>
            )}
          </div>

          <div className="spec-badge badge-resolution" title="Original video dimensions">
            <Sparkles size={13} className="text-cyan" />
            <span>{resolutionBadge}</span>
            <span className="spec-sub">({videoDimensions.width}×{videoDimensions.height})</span>
          </div>

          {/* Color Space Transform (CST) S-Log3 -> Rec.709 Toggle */}
          <div className="cst-toolbar-group" title="Color Space Transform (CST): Map Sony S-Log3 into standard Rec.709 viewing & export space (Shortcut: C)">
            <button 
              type="button"
              className={`cst-toggle-btn ${activeItem?.cstEnabled ? 'active-cst' : ''}`}
              onClick={() => onToggleCST && onToggleCST(activeItem.id)}
              title={activeItem?.cstEnabled ? "CST Active: S-Log3 mapped to Rec.709 (Press C to toggle)" : "CST Inactive: Showing raw flat S-Log3 (Press C to enable)"}
            >
              <Palette size={13} className={activeItem?.cstEnabled ? 'text-cyan' : 'text-muted'} />
              <span>{activeItem?.cstEnabled ? 'CST Rec.709' : 'CST Off'}</span>
              {activeItem?.isSLogDetected && (
                <span className="cst-auto-badge" title="S-Log3 was automatically detected in this video">
                  S-Log
                </span>
              )}
              <kbd className="flag-keycap">C</kbd>
            </button>
          </div>

          <div className="spec-badge badge-fps" title="Calculated frame rate">
            <Gauge size={13} className="text-purple" />
            <select 
              value={fps} 
              onChange={(e) => setFps(Number(e.target.value))}
              className="fps-select"
            >
              <option value="23.976">23.98 fps</option>
              <option value="24">24 fps (Cinema)</option>
              <option value="25">25 fps (PAL)</option>
              <option value="29.97">29.97 fps</option>
              <option value="30">30 fps (NTSC)</option>
              <option value="50">50 fps</option>
              <option value="60">60 fps (UHD)</option>
              <option value="120">120 fps (HFR)</option>
            </select>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-control-group" title="Inspect sharpness and focus before capturing (Shift+Z)">
            <Eye size={13} className="text-cyan" />
            <button 
              className={`zoom-btn ${zoomLevel === 1 ? 'active' : ''}`}
              onClick={() => handleZoomChange(1)}
              title="Fit video in frame"
            >
              Fit
            </button>
            <button 
              className={`zoom-btn ${zoomLevel === 1.5 ? 'active' : ''}`}
              onClick={() => handleZoomChange(1.5)}
              title="150% Zoom"
            >
              1.5x
            </button>
            <button 
              className={`zoom-btn ${zoomLevel === 2 ? 'active' : ''}`}
              onClick={() => handleZoomChange(2)}
              title="200% Pixel Inspection"
            >
              2x
            </button>
            <button 
              className={`zoom-btn ${zoomLevel === 3 ? 'active' : ''}`}
              onClick={() => handleZoomChange(3)}
              title="300% Zoom"
            >
              3x
            </button>
          </div>
        </div>
      </div>

      {/* Main Video Viewport with Zoom & Pan */}
      <div 
        className={`video-viewport ${zoomLevel > 1 ? 'zoom-active' : ''} ${isDraggingPan ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        {/* Floating Lightroom Flag Toast */}
        {flagToast && (
          <div className={`flag-floating-toast ${flagToast.type}`}>
            {flagToast.type === 'flagged' && <Flag size={16} className="text-cyan" />}
            {flagToast.type === 'rejected' && <Ban size={16} className="text-rose" />}
            {flagToast.type === 'unflagged' && <Undo2 size={16} />}
            <span>{flagToast.text}</span>
          </div>
        )}

        {zoomLevel > 1 && (
          <div className="zoom-indicator-tag">
            <div className="zoom-tag-header">
              <Target size={12} className="text-cyan" />
              <span>PIXEL INSPECTION {Math.round(zoomLevel * 100)}%</span>
            </div>
            <span className="pan-hint">Click & Drag to pan frame focus</span>
          </div>
        )}

        <div 
          className="video-transform-layer"
          style={{
            transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
            cursor: zoomLevel > 1 ? (isDraggingPan ? 'grabbing' : 'grab') : 'default'
          }}
        >
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="viewport-video-element"
              style={{
                filter: activeItem?.cstEnabled ? 'url(#cst-slog3-rec709)' : 'none'
              }}
              playsInline
              muted={isMuted}
              onClick={togglePlay}
            />
          ) : (
            <div className="relink-viewport-container">
              {activeItem?.thumbnailUrl && (
                <div 
                  className="relink-bg-blur"
                  style={{ backgroundImage: `url(${activeItem.thumbnailUrl})` }}
                />
              )}
              <div className="relink-studio-card">
                <div className="relink-badge-icon">
                  <HardDrive size={30} className="text-amber" />
                </div>
                <h3 className="relink-title">Media Offline — Session Restored</h3>
                <p className="relink-filename" title={activeItem?.name}>{activeItem?.name}</p>

                <div className="relink-meta-specs">
                  <span className="relink-spec-badge">{activeItem?.resolutionBadge || `${activeItem?.width || 0}p`}</span>
                  <span className="relink-spec-badge">{formatTime(activeItem?.duration || 0)}</span>
                  <span className="relink-spec-badge">{formatBytes(activeItem?.size || 0)}</span>
                </div>

                {hasPinnedFrame && (
                  <div className="relink-pinned-callout">
                    <Pin size={13} className="text-emerald" />
                    <span>
                      {pinnedTimestamps.length > 1
                        ? `${pinnedTimestamps.length} PINNED FRAMES preserved`
                        : `PINNED FRAME: ${formatTime(pinnedTimestamps[0])} preserved`}
                    </span>
                  </div>
                )}

                {activeItem?.cstEnabled && (
                  <div className="relink-cst-callout">
                    <Palette size={13} className="text-cyan" />
                    <span>CST S-Log3 → Rec.709 Active</span>
                  </div>
                )}

                <p className="relink-instruction">
                  To resume live 4K hardware playback and frame extraction, re-link the original file or folder:
                </p>

                <div className="relink-buttons-row">
                  <button 
                    className="btn-primary-relink"
                    onClick={() => relinkFolderInputRef.current?.click()}
                    title="Select folder where your videos are stored (re-links all clips at once)"
                  >
                    <FolderPlus size={16} />
                    <span>Re-link Media Folder</span>
                  </button>

                  <button 
                    className="btn-secondary"
                    onClick={() => relinkFileInputRef.current?.click()}
                    title="Select this single video file from disk"
                  >
                    <Upload size={15} />
                    <span>Re-link File</span>
                  </button>
                </div>

                <div className="relink-drop-prompt">
                  Or drag & drop the video files or folder onto the window to reconnect
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CST active viewport watermark */}
        {activeItem?.cstEnabled && (
          <div className="cst-active-watermark" title="Color Space Transform (S-Log3 → Rec.709) applied to live preview and frame exports">
            <Palette size={12} className="text-cyan" />
            <span>CST: S-LOG3 → REC.709</span>
            {activeItem?.isSLogDetected && <span className="cst-auto-tag">AUTO</span>}
          </div>
        )}

        {/* Pinned frame indicator pill */}
        {hasPinnedFrame && (
          <div className="pinned-frame-watermark">
            <Pin size={13} className="text-emerald" />
            <span>
              {pinnedTimestamps.length === 1 
                ? `PINNED: ${formatTime(pinnedTimestamps[0])}` 
                : `${pinnedTimestamps.length} PINS SAVED`}
            </span>
            {!isCurrentFramePinned && (
              <button 
                className="btn-jump-pinned"
                onClick={() => seekTo(pinnedTimestamps[0])}
                title={`Jump to ${pinnedTimestamps.length > 1 ? 'first pin' : 'pinned frame position'}`}
              >
                {pinnedTimestamps.length > 1 ? 'Jump #1' : 'Jump'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Precision Timeline & Scrubber */}
      <div className="studio-timeline-area">
        <div 
          className="scrubber-track-container" 
          ref={scrubberRef}
          onClick={handleScrubberClick}
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
        >
          <div className="scrubber-track-bg">
            <div 
              className="scrubber-fill"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />

            {pinnedTimestamps.map((pinTime, idx) => (
              <div 
                key={`marker-${idx}-${pinTime}`}
                className={`scrubber-pinned-marker ${Math.abs(currentTime - pinTime) < (0.5 / fps || 0.05) ? 'active-marker' : ''}`}
                style={{ left: `${duration > 0 ? (pinTime / duration) * 100 : 0}%` }}
                title={`Pin #${idx + 1}: ${formatTime(pinTime)} (Click chip to jump)`}
              >
                <div className="marker-pin-head" />
                <div className="marker-pin-line" />
              </div>
            ))}

            {hoverTime !== null && (
              <div 
                className="scrubber-hover-ghost"
                style={{ left: `${hoverPosition}%` }}
              >
                <div className="hover-time-tooltip">
                  {formatTime(hoverTime)}
                </div>
              </div>
            )}

            <div 
              className="scrubber-thumb"
              style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Multi-Pin Frames Ribbon */}
        {hasPinnedFrame && (
          <div className="pinned-frames-ribbon">
            <div className="ribbon-label">
              <Pin size={12} className="text-emerald" />
              <span>Pinned Frames ({pinnedTimestamps.length}):</span>
            </div>
            <div className="ribbon-chips-list">
              {pinnedTimestamps.map((pinTime, idx) => {
                const isActive = Math.abs(currentTime - pinTime) < (0.5 / fps || 0.05);
                return (
                  <div 
                    key={`pin-chip-${idx}-${pinTime}`}
                    className={`pinned-frame-chip ${isActive ? 'active-pin-chip' : ''}`}
                    onClick={() => seekTo(pinTime)}
                    title={`Jump to Pin #${idx + 1} (${formatTime(pinTime)})`}
                  >
                    <span className="chip-badge">#{idx + 1}</span>
                    <span className="chip-time">{formatTime(pinTime)}</span>
                    <button 
                      type="button"
                      className="chip-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRemovePin) onRemovePin(activeItem.id, pinTime);
                      }}
                      title={`Remove Pin #${idx + 1}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
            {pinnedTimestamps.length > 1 && onClearAllPins && (
              <button 
                type="button"
                className="btn-clear-pins"
                onClick={() => onClearAllPins(activeItem.id)}
                title="Remove all pins for this video"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Transport Controls Bar */}
      <div className="studio-transport-bar">
        {/* Left: Precision Timecode & Frame Counter */}
        <div className="transport-timecode-box">
          <div className="main-timecode" title="Current Timecode (HH:MM:SS.mmm)">
            {formatTime(currentTime)}
          </div>
          <div className="timecode-sub-row">
            <span className="timecode-smpte" title="SMPTE Timecode">
              {formatSMPTE(currentTime, fps)}
            </span>
            <span className="timecode-divider">•</span>
            <span className="frame-counter" title="Exact Frame Number">
              F#{currentFrameNumber} <span className="total-frames">/ {totalFrames}</span>
            </span>
          </div>
        </div>

        {/* Center: Precision Stepper and Play Controls */}
        <div className="transport-steppers">
          <button 
            className="transport-btn" 
            onClick={() => seekTo(0)} 
            title="Jump to Start (0)"
          >
            <RotateCcw size={15} />
          </button>

          <button 
            className="transport-btn" 
            onClick={() => stepSeconds(-5)} 
            title="Step Back 5 Seconds"
          >
            <span className="step-label">-5s</span>
          </button>

          <button 
            className="transport-btn" 
            onClick={() => stepSeconds(-1)} 
            title="Step Back 1 Second (Shift + Left)"
          >
            <span className="step-label">-1s</span>
          </button>

          <button 
            className="transport-btn frame-step-btn" 
            onClick={() => stepFrame(-1)} 
            title="Step Back 1 Frame (Left Arrow)"
          >
            <ChevronLeft size={16} />
            <span className="step-label">-1F</span>
          </button>

          <button 
            className={`transport-btn-primary play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlay}
            title="Play / Pause (Spacebar)"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="play-icon-offset" />}
          </button>

          <button 
            className="transport-btn frame-step-btn" 
            onClick={() => stepFrame(1)} 
            title="Step Forward 1 Frame (Right Arrow)"
          >
            <span className="step-label">+1F</span>
            <ChevronRight size={16} />
          </button>

          <button 
            className="transport-btn" 
            onClick={() => stepSeconds(1)} 
            title="Step Forward 1 Second (Shift + Right)"
          >
            <span className="step-label">+1s</span>
          </button>

          <button 
            className="transport-btn" 
            onClick={() => stepSeconds(5)} 
            title="Step Forward 5 Seconds"
          >
            <span className="step-label">+5s</span>
          </button>

          <div className="rate-dropdown-wrapper">
            <select 
              value={playbackRate} 
              onChange={(e) => handleRateChange(Number(e.target.value))}
              className="rate-select"
              title="Playback Speed"
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>

          <button 
            className="transport-btn audio-btn"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={15} className="text-muted" /> : <Volume2 size={15} />}
          </button>
        </div>

        {/* Right: Key Frame Action Buttons */}
        <div className="transport-actions">
          {/* Main Pin Frame Action */}
          <button 
            className={`btn-pin-frame ${isPinAnimActive ? 'pinned-pulse' : ''} ${isCurrentFramePinned ? 'active-pinned' : ''}`}
            onClick={handlePinCurrentFrame}
            title={isCurrentFramePinned ? "Unpin this frame (S or Enter)" : "Pin this frame to export queue (S or Enter)"}
          >
            {isCurrentFramePinned ? (
              <>
                <Check size={16} className="text-emerald" />
                <span>Pinned</span>
                {pinnedTimestamps.length > 1 && (
                  <span className="pin-count-badge" title={`${pinnedTimestamps.length} frames pinned`}>
                    {pinnedTimestamps.length}
                  </span>
                )}
                <kbd className="btn-keycap">S</kbd>
              </>
            ) : (
              <>
                <Pin size={16} />
                <span>Pin Frame</span>
                {pinnedTimestamps.length > 0 && (
                  <span className="pin-count-badge" title={`${pinnedTimestamps.length} frames pinned`}>
                    {pinnedTimestamps.length}
                  </span>
                )}
                <kbd className="btn-keycap">S</kbd>
              </>
            )}
          </button>

          {/* Export Single Frame Immediate */}
          <button 
            className="btn-export-frame"
            onClick={handleExportNow}
            title="Inspect & Export full-res frame now (E)"
          >
            <Camera size={16} />
            <span>Export Frame</span>
            <kbd className="btn-keycap">E</kbd>
          </button>
        </div>
      </div>

      {/* Hidden file inputs for re-linking media */}
      <input 
        type="file" 
        ref={relinkFileInputRef}
        multiple 
        accept="video/*,.mkv,.mp4,.mov,.webm,.m4v,.avi" 
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && onRelinkFiles) {
            onRelinkFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />
      <input 
        type="file" 
        ref={relinkFolderInputRef}
        webkitdirectory="true"
        directory="true"
        multiple 
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && onRelinkFiles) {
            onRelinkFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {/* SVG Filter Definition for real-time GPU S-Log3 -> Rec.709 CST preview */}
      <svg id="cst-svg-defs" style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
        <filter id="cst-slog3-rec709" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={SVG_TABLE_VALUES} />
            <feFuncG type="table" tableValues={SVG_TABLE_VALUES} />
            <feFuncB type="table" tableValues={SVG_TABLE_VALUES} />
          </feComponentTransfer>
          <feColorMatrix type="matrix" values="
            1.586614 -0.505051 -0.081563 0 0
           -0.063236  1.087799 -0.024563 0 0
           -0.020554 -0.130635  1.151189 0 0
            0         0         0        1 0
          " />
        </filter>
      </svg>
    </div>
  );
}
