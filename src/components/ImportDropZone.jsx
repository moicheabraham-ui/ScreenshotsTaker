import React, { useState, useRef } from 'react';
import { UploadCloud, Film, FolderUp, ShieldCheck, Zap, Layers } from 'lucide-react';

export function ImportDropZone({
  onFilesSelected,
  hasItems = false
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

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
      onFilesSelected(files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div 
      className={`import-dropzone ${isDragOver ? 'drag-active' : ''} ${hasItems ? 'compact' : 'hero'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        multiple 
        accept="video/*,.mkv,.mp4,.mov,.webm,.m4v,.avi" 
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <input 
        type="file" 
        ref={folderInputRef}
        webkitdirectory="true"
        directory="true"
        multiple 
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="dropzone-content">
        <div className="dropzone-icon-glow">
          <UploadCloud className="dropzone-icon" size={hasItems ? 28 : 44} />
        </div>

        <div className="dropzone-text-group">
          <h2 className="dropzone-title">
            {hasItems ? 'Drop more high-res videos to add to queue' : 'Import or Bulk Drop High-Resolution Videos'}
          </h2>
          <p className="dropzone-desc">
            Drag & drop heavy video files or entire folders. Supports 4K / 8K, ProRes, MP4, MOV, WebM, MKV. Each import creates a saved session.
          </p>
        </div>

        <div className="dropzone-actions">
          <button 
            type="button" 
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Film size={16} />
            <span>Select Video Files</span>
          </button>

          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp size={16} />
            <span>Import Folder</span>
          </button>
        </div>

        {!hasItems && (
          <div className="dropzone-features">
            <div className="feature-item">
              <ShieldCheck size={18} className="feature-icon text-cyan" />
              <div>
                <strong>Memory Decoupled Architecture</strong>
                <p>Videos stay on disk. Never crashes browser memory even with 50+ GB files.</p>
              </div>
            </div>
            <div className="feature-item">
              <Zap size={18} className="feature-icon text-amber" />
              <div>
                <strong>Lightroom-Style Flagging (Z & X)</strong>
                <p>Press Z to Pick, X to Reject and jump to next video. Culling is instantaneous.</p>
              </div>
            </div>
            <div className="feature-item">
              <Layers size={18} className="feature-icon text-purple" />
              <div>
                <strong>Persistent Saved Sessions</strong>
                <p>Each import is a session. Resume your workflow and pinned frames anytime.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
