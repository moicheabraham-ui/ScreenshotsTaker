import JSZip from 'jszip';
import { detectSLog, applySLog3ToRec709CST } from './colorSpaceTransform';

/**
 * Format seconds to HH:MM:SS.mmm
 */
export function formatTime(seconds = 0) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (n, len = 2) => String(n).padStart(len, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
  }
  return `${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

/**
 * Format to SMPTE timecode (HH:MM:SS:FF)
 */
export function formatSMPTE(seconds = 0, fps = 30) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frame = Math.floor((seconds % 1) * fps);

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frame)}`;
}

/**
 * Format bytes to readable size
 */
export function formatBytes(bytes = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get resolution badge label
 */
export function getResolutionBadge(width = 0, height = 0) {
  if (!width || !height) return 'UNKNOWN';
  if (width >= 7600 || height >= 4300) return '8K UHD';
  if (width >= 3800 || height >= 2100) return '4K UHD';
  if (width >= 2500 || height >= 1400) return '1440p QHD';
  if (width >= 1900 || height >= 1000) return '1080p FHD';
  if (width >= 1200 || height >= 700) return '720p HD';
  return `${width}×${height}`;
}

/**
 * Extract basic video metadata safely without reading entire file into RAM
 */
export function loadVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const duration = video.duration || 0;
      cleanup();

      const sLogCheck = detectSLog(file.name);

      resolve({
        id: 'vid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'video/mp4',
        duration,
        width,
        height,
        aspectRatio: (width / height).toFixed(2),
        resolutionBadge: getResolutionBadge(width, height),
        fps: 30, // Default estimated FPS, user can customize
        thumbnailUrl: null, // Will be generated sequentially
        selectedTimestamp: duration > 1 ? 1.0 : duration / 2, // Default frame
        selectedFrameDataUrl: null,
        status: 'pending', // 'pending' | 'ready' | 'exported'
        isSLogDetected: sLogCheck.isSLog,
        cstEnabled: sLogCheck.isSLog, // Automatically apply CST when S-Log is detected
        cstProfile: 'slog3_rec709',
        createdAt: Date.now(),
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode video "${file.name}". Format may not be supported by browser.`));
    };
  });
}

/**
 * Extract a low-resolution thumbnail for queue list card (memory-efficient)
 */
export function generateQueueThumbnail(file, timestamp = 0.5, options = {}) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    video.onloadedmetadata = () => {
      const seekTime = Math.min(Math.max(0, timestamp), Math.max(0, video.duration - 0.1));
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const targetWidth = 320;
        const targetHeight = Math.round((320 / (video.videoWidth || 16)) * (video.videoHeight || 9));
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        const sampleData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const sLogCheck = detectSLog(file.name, sampleData);
        const shouldApplyCST = options.cstEnabled !== undefined ? options.cstEnabled : sLogCheck.isSLog;

        if (shouldApplyCST) {
          applySLog3ToRec709CST(canvas);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        clearTimeout(timeout);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        console.warn('Thumbnail capture failed', err);
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(null);
    };
  });
}

/**
 * Capture full pristine resolution frame from active video element
 */
export function captureFrameFromVideoElement(video, format = 'image/png', quality = 1.0, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!video || !video.videoWidth || !video.videoHeight) {
        throw new Error('Video is not ready or has zero dimensions');
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (options.cstEnabled) {
        applySLog3ToRec709CST(canvas);
      }

      const mimeType = format === 'jpg' || format === 'jpeg' 
        ? 'image/jpeg' 
        : format === 'webp' 
        ? 'image/webp' 
        : 'image/png';

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create frame blob'));
          return;
        }

        // Create a preview dataUrl or object URL
        const previewUrl = URL.createObjectURL(blob);
        resolve({
          blob,
          previewUrl,
          width: canvas.width,
          height: canvas.height,
          sizeBytes: blob.size,
          mimeType,
          timestamp: video.currentTime,
        });
      }, mimeType, quality);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Sequential background extractor for a single file at a given timestamp
 * Used in batch export queue to process GBs of video one-by-one without memory leaks
 */
export function extractFrameFromFile(file, timestamp, format = 'png', quality = 1.0, scaleFactor = 1.0) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Seek timeout at ${timestamp}s for ${file.name}`));
    }, 15000);

    video.onloadedmetadata = () => {
      const validTime = Math.min(Math.max(0, timestamp), Math.max(0, video.duration - 0.01));
      video.currentTime = validTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const originalWidth = video.videoWidth;
        const originalHeight = video.videoHeight;
        const targetWidth = Math.round(originalWidth * scaleFactor);
        const targetHeight = Math.round(originalHeight * scaleFactor);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        if (options.cstEnabled) {
          applySLog3ToRec709CST(canvas);
        }

        const mimeType = format === 'jpg' || format === 'jpeg'
          ? 'image/jpeg'
          : format === 'webp'
          ? 'image/webp'
          : 'image/png';

        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) {
            reject(new Error('Failed to encode frame blob'));
            return;
          }
          resolve({
            blob,
            width: targetWidth,
            height: targetHeight,
            sizeBytes: blob.size,
            mimeType,
          });
        }, mimeType, quality);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Failed to load video ${file.name} for extraction`));
    };
  });
}

/**
 * Download a single blob file with custom filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

/**
 * Generate formatted file name based on template and pin index
 */
export function getExportFileName(videoName, timestamp, index, extension = 'png', template = '{name}_frame_{time}', pinIndex = 0, totalPinsForItem = 1) {
  const cleanName = videoName.replace(/\.[^/.]+$/, '');
  const timeStr = formatTime(timestamp).replace(/[:.]/g, '-');
  const indexStr = String(index + 1).padStart(3, '0');
  const pinSuffix = totalPinsForItem > 1 ? `_pin${String(pinIndex + 1).padStart(2, '0')}` : '';

  let name = template
    .replace('{name}', cleanName + pinSuffix)
    .replace('{time}', timeStr)
    .replace('{index}', indexStr);

  return `${name}.${extension}`;
}

/**
 * Batch export queue items with multiple pins into a single ZIP file or individual downloads
 */
export async function batchExportQueue(queueItems, options, onProgress) {
  const {
    format = 'png',
    quality = 1.0,
    scaleFactor = 1.0,
    zipExport = true,
    zipName = 'FrameForge_Exported_Frames.zip',
    nameTemplate = '{name}_frame_{time}',
  } = options;

  // Flatten all pin tasks from every video
  const frameTasks = [];
  queueItems.forEach((item, itemIdx) => {
    const pins = Array.isArray(item.pinnedTimestamps) && item.pinnedTimestamps.length > 0
      ? item.pinnedTimestamps
      : (item.selectedTimestamp !== null && item.selectedTimestamp !== undefined ? [item.selectedTimestamp] : []);

    pins.forEach((timestamp, pinIdx) => {
      frameTasks.push({
        item,
        timestamp,
        pinIndex: pinIdx,
        totalPinsForItem: pins.length,
        itemIndex: itemIdx,
      });
    });
  });

  const total = frameTasks.length;
  if (total === 0) return [];

  const zip = zipExport ? new JSZip() : null;
  const exportedResults = [];

  for (let i = 0; i < total; i++) {
    const task = frameTasks[i];
    const { item, timestamp, pinIndex, totalPinsForItem } = task;

    if (onProgress) {
      onProgress({
        index: i,
        total,
        currentName: totalPinsForItem > 1 
          ? `${item.name} (Pin ${pinIndex + 1}/${totalPinsForItem})` 
          : item.name,
        timestamp,
        status: 'extracting',
        progress: (i / total) * 100,
      });
    }

    try {
      const result = await extractFrameFromFile(item.file, timestamp, format, quality, scaleFactor, {
        cstEnabled: item.cstEnabled,
      });
      const filename = getExportFileName(item.name, timestamp, i, format, nameTemplate, pinIndex, totalPinsForItem);

      if (zipExport) {
        zip.file(filename, result.blob);
      } else {
        downloadBlob(result.blob, filename);
        // Small delay between browser downloads to prevent browser blocking
        await new Promise((r) => setTimeout(r, 250));
      }

      exportedResults.push({
        id: item.id,
        filename,
        timestamp,
        sizeBytes: result.sizeBytes,
        width: result.width,
        height: result.height,
        success: true,
      });
    } catch (err) {
      console.error(`Failed to export frame at ${timestamp}s for ${item.name}:`, err);
      exportedResults.push({
        id: item.id,
        filename: item.name,
        timestamp,
        success: false,
        error: err.message,
      });
    }
  }

  if (zipExport && zip) {
    if (onProgress) {
      onProgress({
        index: total,
        total,
        currentName: 'Compiling ZIP package...',
        timestamp: 0,
        status: 'zipping',
        progress: 98,
      });
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    downloadBlob(zipBlob, zipName);
  }

  if (onProgress) {
    onProgress({
      index: total,
      total,
      currentName: 'Complete!',
      timestamp: 0,
      status: 'completed',
      progress: 100,
    });
  }

  return exportedResults;
}
