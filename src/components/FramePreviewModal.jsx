import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  Sparkles, 
  Image as ImageIcon, 
  Maximize2,
  FileText
} from 'lucide-react';
import { formatBytes, formatTime, downloadBlob } from '../utils/videoProcessor';

export function FramePreviewModal({
  isOpen,
  onClose,
  activeItem,
  frameData
}) {
  const [format, setFormat] = useState('png'); // 'png' | 'jpeg' | 'webp'
  const [quality, setQuality] = useState(0.95);
  const [copied, setCopied] = useState(false);
  const [customName, setCustomName] = useState(() => {
    const clean = (activeItem?.name || 'video').replace(/\.[^/.]+$/, '');
    const timeStr = formatTime(frameData?.timestamp || 0).replace(/[:.]/g, '-');
    return `${clean}_frame_${timeStr}`;
  });

  if (!isOpen || !frameData) return null;

  const handleDownload = () => {
    // If format is same as original captured blob
    if (format === 'png' && frameData.blob.type === 'image/png') {
      downloadBlob(frameData.blob, `${customName}.png`);
      onClose();
      return;
    }

    // Otherwise convert on offscreen canvas
    const img = new Image();
    img.src = frameData.previewUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = frameData.width;
      canvas.height = frameData.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${customName}.${format}`);
          onClose();
        }
      }, mimeType, quality);
    };
  };

  const handleCopyClipboard = async () => {
    try {
      if (frameData.blob) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': frameData.blob
          })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.warn('Clipboard copy not supported or failed:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <ImageIcon size={19} className="text-cyan" />
            <h3 className="modal-title">High-Resolution Frame Inspector</h3>
            <span className="modal-res-badge">
              {frameData.width} × {frameData.height} (1:1 Native Pixels)
            </span>
          </div>

          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body preview-modal-body">
          {/* Frame Image View */}
          <div className="preview-image-stage">
            <img 
              src={frameData.previewUrl} 
              alt="Captured Frame Preview" 
              className="preview-img"
            />
            <div className="preview-stamp">
              <span>Timecode: {formatTime(frameData.timestamp)}</span>
              <span>•</span>
              <span>Size: ~{formatBytes(frameData.sizeBytes)}</span>
            </div>
          </div>

          {/* Export Settings Panel */}
          <div className="preview-settings-panel">
            <div className="form-group">
              <label className="form-label">Export Format</label>
              <div className="format-pills">
                <button 
                  className={`format-pill ${format === 'png' ? 'active' : ''}`}
                  onClick={() => setFormat('png')}
                >
                  PNG (Lossless 24-bit)
                </button>
                <button 
                  className={`format-pill ${format === 'jpeg' ? 'active' : ''}`}
                  onClick={() => setFormat('jpeg')}
                >
                  JPEG (Ultra Q95)
                </button>
                <button 
                  className={`format-pill ${format === 'webp' ? 'active' : ''}`}
                  onClick={() => setFormat('webp')}
                >
                  WebP (Next-Gen)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">File Name</label>
              <div className="input-with-ext">
                <input 
                  type="text" 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="form-input"
                />
                <span className="input-ext-tag">.{format}</span>
              </div>
            </div>

            <div className="preview-specs-box">
              <div className="spec-row">
                <span className="spec-label">Native Video:</span>
                <span className="spec-val">{activeItem?.name}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Resolution:</span>
                <span className="spec-val text-cyan">{frameData.width} × {frameData.height}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Capture Timestamp:</span>
                <span className="spec-val text-emerald">{formatTime(frameData.timestamp)}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Color Space:</span>
                <span className={`spec-val ${activeItem?.cstEnabled ? 'text-cyan' : ''}`}>
                  {activeItem?.cstEnabled ? 'Rec.709 (CST: S-Log3 Mapped)' : 'Native (Passthrough)'}
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Downscaling:</span>
                <span className="spec-val">None (Pristine Original)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleCopyClipboard}>
            {copied ? <Check size={16} className="text-emerald" /> : <Copy size={16} />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
          </button>

          <button className="btn-primary" onClick={handleDownload}>
            <Download size={16} />
            <span>Download High-Res Frame</span>
          </button>
        </div>
      </div>
    </div>
  );
}
