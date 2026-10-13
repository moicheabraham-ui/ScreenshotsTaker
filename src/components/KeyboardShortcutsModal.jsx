import React from 'react';
import { X, Keyboard, Flag, Ban } from 'lucide-react';

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Z', desc: 'Lightroom Flag: Pick (Add to export queue)', highlight: true },
    { key: 'X', desc: 'Lightroom Flag: Reject (Exclude from queue)', highlight: true },
    { key: 'U', desc: 'Unflag: Reset flag status to neutral' },
    { key: 'Space', desc: 'Play / Pause video' },
    { key: '← / →', desc: 'Step 1 Frame backward / forward' },
    { key: 'Shift + ← / →', desc: 'Step 1 Second backward / forward' },
    { key: 'S  or  Enter', desc: 'Pin / Toggle frame (supports multiple pins per clip)' },
    { key: 'E', desc: 'Export & inspect current full-res frame now' },
    { key: '↑ / ↓  (o  [ / ])', desc: 'Avanzar / Retroceder de video en la cola', highlight: true },
    { key: 'C', desc: 'Toggle Color Space Transform (CST: S-Log3 → Rec.709)', highlight: true },
    { key: 'Shift + Z', desc: 'Toggle 200% Pixel Inspection zoom' },
    { key: 'M', desc: 'Toggle audio mute' },
    { key: '0  ..  9', desc: 'Seek to 0% - 90% of video duration' },
    { key: '?', desc: 'Open / Close this shortcuts cheatsheet' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Keyboard size={19} className="text-cyan" />
            <h3 className="modal-title">Studio Keyboard Shortcuts</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body shortcuts-list">
          {shortcuts.map((item, i) => (
            <div key={i} className={`shortcut-row ${item.highlight ? 'highlight-shortcut' : ''}`}>
              <span className="shortcut-desc">{item.desc}</span>
              <kbd className="shortcut-keycap">{item.key}</kbd>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
