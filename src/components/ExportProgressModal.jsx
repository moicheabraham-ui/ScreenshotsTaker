import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Archive, 
  CheckCircle2, 
  Loader2, 
  FolderArchive,
  Layers,
  Flag,
  Ban,
  Palette
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { batchExportQueue } from '../utils/videoProcessor';

export function ExportProgressModal({
  isOpen,
  onClose,
  queue,
  onExportFinished
}) {
  // Filter mode: 'flagged_only' | 'non_rejected' | 'all'
  const hasFlagged = (queue || []).some(i => i.flag === 'flagged');
  const [filterMode, setFilterMode] = useState(hasFlagged ? 'flagged_only' : 'non_rejected');
  const [format, setFormat] = useState('png'); // 'png' | 'jpeg' | 'webp'
  const [quality, setQuality] = useState(0.95);
  const [zipExport, setZipExport] = useState(true);
  const [zipName, setZipName] = useState('FrameForge_Frames_4K.zip');
  const [nameTemplate, setNameTemplate] = useState('{name}_frame_{time}');

  // Execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  const [results, setResults] = useState([]);

  if (!isOpen) return null;

  // Compute eligible items: only items with a pinned frame and matching the Lightroom flag filter
  const eligibleItems = queue.filter(item => {
    const hasPins = (Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0) ||
      (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined);
    if (!hasPins) return false;
    if (filterMode === 'flagged_only' && item.flag !== 'flagged') return false;
    if (filterMode === 'non_rejected' && item.flag === 'rejected') return false;
    return true;
  });

  const totalFramesToExport = eligibleItems.reduce((acc, item) => {
    const pins = Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0
      ? item.pinnedTimestamps
      : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);
    return acc + Math.max(1, pins.length);
  }, 0);

  const cstEligibleCount = eligibleItems.filter(i => i.cstEnabled).length;

  const handleStartExport = async () => {
    if (eligibleItems.length === 0) return;

    setIsProcessing(true);
    setIsFinished(false);
    setProgressState({
      index: 0,
      total: totalFramesToExport,
      currentName: 'Initializing engine...',
      status: 'starting',
      progress: 0,
    });

    try {
      const exportResults = await batchExportQueue(
        eligibleItems,
        {
          format,
          quality,
          zipExport,
          zipName,
          nameTemplate,
        },
        (progress) => {
          setProgressState(progress);
        }
      );

      setResults(exportResults);
      setIsProcessing(false);
      setIsFinished(true);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      if (onExportFinished) {
        onExportFinished(exportResults.map(r => r.id));
      }
    } catch (err) {
      console.error('Batch export failed:', err);
      setIsProcessing(false);
    }
  };

  const handleDone = () => {
    setIsFinished(false);
    setProgressState(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={!isProcessing ? onClose : undefined}>
      <div className="modal-container batch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Archive size={19} className="text-cyan" />
            <h3 className="modal-title">
              {isFinished ? 'Batch Export Completed' : isProcessing ? 'Exporting Frames in Queue...' : 'Batch Queue Export'}
            </h3>
          </div>

          {!isProcessing && (
            <button className="modal-close-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {!isProcessing && !isFinished && (
            <div className="batch-config-view">
              <div className="batch-summary-callout">
                <Layers size={18} className="text-cyan" />
                <div>
                  <strong>{totalFramesToExport} Frames from {eligibleItems.length} Videos Queued</strong>
                  <p>Frames extracted at 100% native resolution sequentially to protect browser memory.</p>
                </div>
              </div>

              {cstEligibleCount > 0 && (
                <div className="cst-export-callout">
                  <Palette size={14} className="text-cyan" />
                  <span>Color Space Transform (S-Log3 → Rec.709) applied to {cstEligibleCount} video{cstEligibleCount > 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Lightroom Flag Filter Options */}
              <div className="form-group">
                <label className="form-label">Queue Selection (Lightroom Flags)</label>
                <div className="format-pills">
                  <button 
                    className={`format-pill ${filterMode === 'flagged_only' ? 'active' : ''}`}
                    onClick={() => setFilterMode('flagged_only')}
                  >
                    <div className="flex-row-between">
                      <span>Only Flagged Picks (Z)</span>
                      <span className="text-cyan font-mono">{queue.filter(i => i.flag === 'flagged').length} clips</span>
                    </div>
                  </button>

                  <button 
                    className={`format-pill ${filterMode === 'non_rejected' ? 'active' : ''}`}
                    onClick={() => setFilterMode('non_rejected')}
                  >
                    <div className="flex-row-between">
                      <span>All Non-Rejected (Exclude X)</span>
                      <span className="text-muted font-mono">{queue.filter(i => i.flag !== 'rejected').length} clips</span>
                    </div>
                  </button>

                  <button 
                    className={`format-pill ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    <div className="flex-row-between">
                      <span>All Videos in Queue</span>
                      <span className="font-mono">{queue.length} clips</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Format selection */}
              <div className="form-group">
                <label className="form-label">Export Image Format</label>
                <div className="format-pills">
                  <button 
                    className={`format-pill ${format === 'png' ? 'active' : ''}`}
                    onClick={() => setFormat('png')}
                  >
                    PNG (Lossless 24-bit • Best Quality)
                  </button>
                  <button 
                    className={`format-pill ${format === 'jpeg' ? 'active' : ''}`}
                    onClick={() => setFormat('jpeg')}
                  >
                    JPEG (Ultra Q95 • Smaller Size)
                  </button>
                  <button 
                    className={`format-pill ${format === 'webp' ? 'active' : ''}`}
                    onClick={() => setFormat('webp')}
                  >
                    WebP (Modern Lossless)
                  </button>
                </div>
              </div>

              {/* Package mode */}
              <div className="form-group">
                <label className="form-label">Delivery Method</label>
                <div className="toggle-options-row">
                  <label className={`toggle-box ${zipExport ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="delivery" 
                      checked={zipExport} 
                      onChange={() => setZipExport(true)} 
                    />
                    <FolderArchive size={17} className="text-cyan" />
                    <div>
                      <strong>Download as Single ZIP Archive (Recommended)</strong>
                      <p>Bundles all {totalFramesToExport} high-res images into one clean zip file</p>
                    </div>
                  </label>

                  <label className={`toggle-box ${!zipExport ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="delivery" 
                      checked={!zipExport} 
                      onChange={() => setZipExport(false)} 
                    />
                    <Download size={17} className="text-purple" />
                    <div>
                      <strong>Individual Direct File Downloads</strong>
                      <p>Downloads each image sequentially to browser downloads folder</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Name Template */}
              <div className="form-group">
                <label className="form-label">File Naming Pattern</label>
                <select 
                  className="form-select"
                  value={nameTemplate}
                  onChange={(e) => setNameTemplate(e.target.value)}
                >
                  <option value="{name}_frame_{time}">{`{video_name}_frame_{timestamp}`}</option>
                  <option value="{name}_shot_{index}">{`{video_name}_shot_{001}`}</option>
                  <option value="{index}_{name}">{`{001}_{video_name}`}</option>
                </select>
              </div>

            </div>
          )}

          {/* Processing Status View */}
          {isProcessing && progressState && (
            <div className="batch-progress-view">
              <div className="progress-center-icon">
                <Loader2 size={42} className="spin-animation text-cyan" />
              </div>

              <h4 className="progress-headline">
                {progressState.status === 'zipping' ? 'Packing ZIP Archive...' : `Processing ${progressState.index + 1} of ${progressState.total}`}
              </h4>

              <p className="progress-sub-text">
                {progressState.currentName}
              </p>

              <div className="progress-bar-track">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${progressState.progress}%` }}
                />
              </div>

              <div className="progress-stats-footer">
                <span>Memory Decoupled Engine</span>
                <span className="font-mono">{Math.round(progressState.progress)}%</span>
              </div>
            </div>
          )}

          {/* Finished View */}
          {isFinished && (
            <div className="batch-finished-view">
              <div className="finished-icon-burst">
                <CheckCircle2 size={50} className="text-emerald" />
              </div>

              <h4 className="finished-headline">Successfully Exported {results.length} Frames!</h4>
              <p className="finished-sub">
                All frames rendered at full uncompressed resolution with pristine clarity.
              </p>

              <div className="results-list">
                {results.slice(0, 5).map((res, i) => (
                  <div key={i} className="result-item">
                    <span className="result-name">{res.filename}</span>
                    <span className="result-badge text-cyan">{res.width}×{res.height}</span>
                  </div>
                ))}
                {results.length > 5 && (
                  <div className="results-more-note">
                    + {results.length - 5} more frames exported
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isProcessing && !isFinished && (
            <>
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button 
                className="btn-primary glow-button" 
                onClick={handleStartExport}
                disabled={eligibleItems.length === 0}
              >
                <Download size={16} />
                <span>Start Batch Export ({totalFramesToExport} frames)</span>
              </button>
            </>
          )}

          {isFinished && (
            <button className="btn-primary" onClick={handleDone}>
              <span>Done</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
