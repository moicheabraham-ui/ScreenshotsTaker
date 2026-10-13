# FrameForge 4K — Pro Bulk Video Frame Extractor & Batch Queue

A high-resolution, memory-safe video frame extraction studio engineered specifically for importing heavy 4K and 8K videos without browser memory leaks or crashes, featuring saved import sessions and Adobe Lightroom-style culling.

---

## ⚡ Key Highlights & Architecture

- **Import Sessions (Save / Resume / Delete)**:
  - Every file or folder import automatically creates a persistent session stored in IndexedDB.
  - Sessions preserve the video list, pinned timestamps, resolutions, and Lightroom flag statuses.
  - Switch between past sessions, resume work anytime, or delete sessions when completed.
- **Lightroom-Style Flagging & Culling (`Z` & `X`)**:
  - `Z` = **Flag / Pick**: Marks video for inclusion in the export queue.
  - `X` = **Reject**: Marks video as rejected (excluded from queue) and **automatically advances to the next video**.
  - `U` = **Unflag**: Resets flag status to neutral.
  - Filter queue by **Picks (Z)**, **Unflagged**, or **Reject (X)**. One-click "Purge Rejected" to clean the queue.
- **Engineered for Heavy Multi-Gigabyte Videos**:
  - Direct stream pointers (`URL.createObjectURL`) and decoupled hardware decoders ensure videos stay referenced on disk and never crash browser RAM.
  - Sequential background workers process thumbnails and batch exports 1-by-1 to prevent GPU decoder thrashing.
- **True 1:1 Pristine High-Resolution Extractions**:
  - Extracts full native pixel frames (`3840×2160`, `4096×2160`, `7680×4320`) without downscaling.
  - Supports lossless 24-bit **PNG**, ultra-quality **JPEG (Q95)**, and next-gen **WebP**.
- **Interactive Pixel Inspector & Focus Magnifier**:
  - Zoom levels (`Fit`, `1.5x`, `2x`, `3x`) with click-and-drag panning to verify critical focus and sharpness before pinning a frame.
- **Color Space Transform (CST: S-Log3 → Rec.709)**:
  - Automatically detects Sony S-Log3 videos (from filename and log histogram signature) and auto-applies CST to restore true Rec.709 contrast, deep blacks, and rich gamut colors.
  - Per-clip toggle button (`CST Rec.709` / `CST Off` or shortcut <kbd>C</kbd>) allows activating or deactivating CST for each video individually.
  - Live hardware-accelerated SVG filter preview in the player.
  - Applies 32-bit floating-point WebGL/CPU color science directly to single-frame exports and batch queue exports for studio-accurate results.
- **Multiple Pinned Frames per Clip**:
  - Pin multiple frames (`S` or `Enter`) across the same video timeline.
  - Interactive timeline markers and a Pinned Frames Ribbon let you jump directly to any frame or remove individual pins.
  - Export queue extracts all pinned frames from each clip with automatic numbering suffixes (`_pin01`, `_pin02`, etc.).
- **Batch Processing & ZIP Bundling**:
  - Export all flagged/pinned frames into an organized `.zip` archive or sequential file downloads with custom naming patterns (`{name}_frame_{time}`).

---

## 🚀 Getting Started

### 1. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Build for Production
```bash
npm run build
```

---

## ⌨️ Studio Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `↑` / `↓` or `[` / `]` | **Navigate Previous / Next video in queue** |
| `Z` | **Lightroom Pick**: Flag video for export queue |
| `X` | **Lightroom Reject**: Exclude from queue & **jump to next video** |
| `U` | **Unflag**: Reset flag status |
| `C` | **Toggle Color Space Transform (CST: S-Log3 → Rec.709)** |
| `Space` | Play / Pause video |
| `←` / `→` | Step 1 Frame backward / forward |
| `Shift + ←` / `Shift + →` | Step 1 Second backward / forward |
| `S` or `Enter` | **Pin / Toggle frame timestamp (supports multiple pins per clip)** |
| `E` | Open Frame Inspector & export single frame |
| `Shift + Z` | Toggle 200% Pixel Inspection Zoom |
| `0` .. `9` | Seek to 0% .. 90% of video duration |
| `?` | Toggle Keyboard Shortcuts cheatsheet |
| `Esc` | Close open dialog or modal |
