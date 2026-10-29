/**
 * LinguaFloat DE - Mini Corner Widget Engine
 * Real-time word/paragraph synchronization, YouTube API & paragraph tap-to-replay
 */

class MiniLinguaFloatApp {
  constructor() {
    this.words = [];
    this.segments = [];
    this.activeWordIndex = -1;
    this.activeSegmentIndex = -1;
    this.autoScrollEnabled = true;
    this.isUserBrowsing = false;
    this.isPlaying = false;
    this.activePlayerType = "clock"; // Default to "clock" until audio/yt loaded
    this.ytPlayer = null;
    this.ytReady = false;
    this.speeds = [0.75, 1.0, 1.25, 1.5];
    this.speedIndex = 1;

    // Synthetic clock for demo playback
    this.clockStartPerf = 0;
    this.clockOffsetSec = 0;
    this.clockDurationSec = 16.5;

    // DOM Elements
    this.audio = document.getElementById("audio-engine");
    this.transcriptContainer = document.getElementById("transcript-container");
    this.btnPlayPause = document.getElementById("btn-play-pause");
    this.timeDisplay = document.getElementById("time-display");
    this.statusHint = document.getElementById("status-hint");
    this.progressContainer = document.getElementById("progress-container");
    this.progressFill = document.getElementById("progress-fill");
    this.btnCycleSpeed = document.getElementById("btn-cycle-speed");
    this.btnToggleScroll = document.getElementById("btn-toggle-scroll");
    this.headerTitle = document.getElementById("header-title");
    this.currentLoadedId = null;

    // Modal elements
    this.btnOpenUrlModal = document.getElementById("btn-open-url-modal");
    this.urlModal = document.getElementById("url-modal");
    this.ytUrlInput = document.getElementById("yt-url-input");
    this.btnSubmitUrl = document.getElementById("btn-submit-url");
    this.btnCloseModal = document.getElementById("btn-close-modal");
    this.localFileInput = document.getElementById("local-file-input");

    // Library modal elements
    this.btnOpenLibraryModal = document.getElementById("btn-open-library-modal");
    this.libraryModal = document.getElementById("library-modal");
    this.btnCloseLibrary = document.getElementById("btn-close-library");
    this.libraryList = document.getElementById("library-list");
    this.btnBrowseLocal = document.getElementById("btn-browse-local");

    // English Translation Feature (Show/Hide English subtitles)
    this.translationEnabled = false;
    this.btnToggleTranslation = document.getElementById("btn-toggle-translation");
    this.isTranslatingBatch = false;

    // In-App Rename Modal Elements
    this.renameModal = document.getElementById("rename-modal");
    this.renameInput = document.getElementById("rename-input");
    this.renameError = document.getElementById("rename-error");
    this.btnConfirmRename = document.getElementById("btn-confirm-rename");
    this.btnCancelRename = document.getElementById("btn-cancel-rename");
    this.btnCloseRename = document.getElementById("btn-close-rename");
    this.pendingRenameItem = null;

    // Floating Selected Expression Popover
    this.expressionPopover = document.getElementById("expression-popover");
    this.popoverDeText = document.getElementById("popover-de-text");
    this.popoverEnText = document.getElementById("popover-en-text");
    this.btnClosePopover = document.getElementById("btn-close-popover");

    // Feature 1: Noun Genders (der=blue, die=red, das=green)
    this.gendersEnabled = true;
    this.btnToggleGender = document.getElementById("btn-toggle-gender");

    // Feature 3: Shadowing / Auto-Loop
    this.loopModes = [0, 1, 2, Infinity];
    this.loopModeIndex = 0;
    this.currentSegmentRepeats = 0;
    this.lastLoopSeekTime = 0;
    this.bgWorker = null;
    this.btnCycleLoop = document.getElementById("btn-cycle-loop");

    // Multi-Paragraph Range Loop (A-B)
    this.loopRange = null; // { start: int, end: int }
    this.abSelectionStep = 0; // 0 = idle, 1 = awaiting A, 2 = awaiting B
    this.abPendingStart = -1;
    this.rangeLoopCount = 0;
    this.btnAbLoop = document.getElementById("btn-ab-loop");
    this.rangeBadge = document.getElementById("range-badge");

    // Feature 6: Global Shortcuts (with master ON/OFF toggle)
    this.shortcutsEnabled = true;
    this.btnToggleShortcuts = document.getElementById("btn-toggle-shortcuts");

    // Feature 8: Ultra-Compact Ticker Mode
    this.isTickerMode = false;
    this.miniAppContainer = document.querySelector(".mini-app");
    this.btnToggleTicker = document.getElementById("btn-toggle-ticker");
    this.tickerBar = document.getElementById("ticker-bar");
    this.btnTickerPlay = document.getElementById("btn-ticker-play");
    this.btnTickerExpand = document.getElementById("btn-ticker-expand");
    this.tickerSegBadge = document.getElementById("ticker-seg-badge");
    this.tickerWordsMount = document.getElementById("ticker-words-mount");

    this.wordDOMElements = [];
    this.parrafoDOMElements = [];

    // Loader overlay elements
    this.loaderOverlay = document.getElementById("loader-overlay");
    this.loaderTitle = document.getElementById("loader-title");
    this.loaderSub = document.getElementById("loader-sub");
    this.loaderBar = document.getElementById("loader-bar");
    this.loaderPct = document.getElementById("loader-pct");
    this.loaderInterval = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadYouTubeIframeAPI();
    this.loadInitialDemo();
    this.startGlobalSyncLoop();
  }

  bindEvents() {
    // Play / Pause Toggle
    this.btnPlayPause.addEventListener("click", () => this.togglePlayPause());

    // Progress click to seek
    this.progressContainer.addEventListener("click", (e) => this.handleProgressClick(e));

    // Cycle speed
    this.btnCycleSpeed.addEventListener("click", () => this.cyclePlaybackSpeed());

    // Auto-scroll toggle / manual browsing reset
    this.btnToggleScroll.addEventListener("click", () => {
      if (this.isUserBrowsing) {
        this.isUserBrowsing = false;
        this.autoScrollEnabled = true;
        this.updateScrollButtonState();
        if (this.activeSegmentIndex !== -1) {
          this.scrollToSegment(this.activeSegmentIndex, true);
          this.statusHint.textContent = `Auto-scroll ON (Top: § ${this.activeSegmentIndex + 1})`;
        }
      } else {
        this.autoScrollEnabled = !this.autoScrollEnabled;
        this.updateScrollButtonState();
        this.statusHint.textContent = this.autoScrollEnabled ? "Auto-scroll ON" : "Auto-scroll OFF";
        if (this.autoScrollEnabled && this.activeSegmentIndex !== -1) {
          this.scrollToSegment(this.activeSegmentIndex, true);
        }
      }
    });

    // Detect user-initiated manual scrolling (wheel, touch, scrollbar drag, keys)
    this.transcriptContainer.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > 2) this.onUserInitiatedScroll();
    }, { passive: true });

    this.transcriptContainer.addEventListener("touchmove", () => {
      this.onUserInitiatedScroll();
    }, { passive: true });

    this.transcriptContainer.addEventListener("pointerdown", (e) => {
      const rect = this.transcriptContainer.getBoundingClientRect();
      if (e.clientX >= rect.right - 18) {
        this.onUserInitiatedScroll();
      }
    });

    this.transcriptContainer.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Space"].includes(e.code)) {
        this.onUserInitiatedScroll();
      }
    });

    // Clicking status hint when browsing snaps back to playing paragraph
    this.statusHint.addEventListener("click", () => {
      if (this.isUserBrowsing && this.activeSegmentIndex !== -1) {
        this.isUserBrowsing = false;
        this.updateScrollButtonState();
        this.scrollToSegment(this.activeSegmentIndex, true);
        this.statusHint.textContent = `§ ${this.activeSegmentIndex + 1} playing`;
      }
    });

    // URL Modal controls
    this.btnOpenUrlModal.addEventListener("click", () => {
      this.urlModal.style.display = "flex";
      this.ytUrlInput.focus();
    });

    this.btnCloseModal.addEventListener("click", () => {
      this.urlModal.style.display = "none";
    });

    this.btnSubmitUrl.addEventListener("click", () => this.processYouTubeUrl());
    this.ytUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.processYouTubeUrl();
      if (e.key === "Escape") this.urlModal.style.display = "none";
    });

    // Local file input
    this.localFileInput.addEventListener("change", (e) => this.handleLocalFile(e));

    // Library Modal
    if (this.btnOpenLibraryModal) {
      this.btnOpenLibraryModal.addEventListener("click", () => this.openLibraryModal());
    }
    if (this.btnCloseLibrary) {
      this.btnCloseLibrary.addEventListener("click", () => {
        if (this.libraryModal) this.libraryModal.style.display = "none";
      });
    }
    if (this.btnBrowseLocal) {
      this.btnBrowseLocal.addEventListener("click", async () => {
        if (this.libraryModal) this.libraryModal.style.display = "none";

        // 1. If pywebview desktop window is available, open native Windows Explorer dialog in downloads/
        if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.open_file_dialog === "function") {
          try {
            const paths = await window.pywebview.api.open_file_dialog();
            if (paths && paths.length) {
              await this.loadLocalPaths(paths);
              return;
            }
          } catch (err) {
            console.warn("Desktop file dialog error, fallback to browser input:", err);
          }
        }

        // 2. Fallback to standard browser file picker
        this.localFileInput.click();
      });
    }

    // Header title click: 1-click rename of currently loaded lesson
    if (this.headerTitle) {
      this.headerTitle.addEventListener("click", () => {
        if (this.currentLoadedId) {
          this.promptRenameLesson({ id: this.currentLoadedId, title: this.headerTitle.textContent });
        }
      });
    }

    // Feature 1: Toggle Gender Highlighting
    if (this.btnToggleGender) {
      this.btnToggleGender.addEventListener("click", () => this.toggleGenderHighlighting());
    }

    // English Translation toggle (Show / Hide English)
    if (this.btnToggleTranslation) {
      this.btnToggleTranslation.addEventListener("click", () => this.toggleTranslation());
    }

    // In-App Rename Modal listeners
    if (this.btnConfirmRename) {
      this.btnConfirmRename.addEventListener("click", () => this.confirmRenameLesson());
    }
    if (this.btnCancelRename) {
      this.btnCancelRename.addEventListener("click", () => this.closeRenameModal());
    }
    if (this.btnCloseRename) {
      this.btnCloseRename.addEventListener("click", () => this.closeRenameModal());
    }
    if (this.renameInput) {
      this.renameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.confirmRenameLesson();
        if (e.key === "Escape") this.closeRenameModal();
      });
    }

    // Expression translation on text selection
    this.transcriptContainer.addEventListener("mouseup", () => this.handleTextSelection());
    if (this.btnClosePopover) {
      this.btnClosePopover.addEventListener("click", () => this.hideExpressionPopover());
    }
    document.addEventListener("mousedown", (e) => {
      if (this.expressionPopover && this.expressionPopover.style.display !== "none") {
        if (!this.expressionPopover.contains(e.target)) {
          this.hideExpressionPopover();
        }
      }
    });

    // Feature 3: Cycle Loop / Shadowing Mode
    if (this.btnCycleLoop) {
      this.btnCycleLoop.addEventListener("click", () => this.cycleLoopMode());
    }

    // Multi-Paragraph A-B Range Loop
    if (this.btnAbLoop) {
      this.btnAbLoop.addEventListener("click", () => this.toggleAbMode());
    }
    if (this.rangeBadge) {
      this.rangeBadge.addEventListener("click", () => this.clearLoopRange());
    }

    // Feature 6: Toggle Shortcuts
    if (this.btnToggleShortcuts) {
      this.btnToggleShortcuts.addEventListener("click", () => {
        this.shortcutsEnabled = !this.shortcutsEnabled;
        this.btnToggleShortcuts.classList.toggle("active", this.shortcutsEnabled);
        this.statusHint.textContent = this.shortcutsEnabled ? "Hotkeys ON (Space, R, Arrows)" : "Hotkeys OFF";
      });
    }

    // Feature 8: Ticker Mode Controls
    if (this.btnToggleTicker) {
      this.btnToggleTicker.addEventListener("click", () => this.toggleTickerMode());
    }
    if (this.btnTickerExpand) {
      this.btnTickerExpand.addEventListener("click", () => this.toggleTickerMode());
    }
    if (this.btnTickerPlay) {
      this.btnTickerPlay.addEventListener("click", () => this.togglePlayPause());
    }

    // Global Keydown Hotkeys Dispatcher
    window.addEventListener("keydown", (e) => this.handleGlobalKeyDown(e));

    // Audio element native listeners
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this.btnPlayPause.textContent = "⏸";
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this.btnPlayPause.textContent = "▶";
    });
  }

  loadYouTubeIframeAPI() {
    if (window.YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.ytReady = true;
    };
  }

  // Continuous sync loop that checks whatever player is currently active
  startGlobalSyncLoop() {
    const onTick = () => {
      const currentTime = this.getCurrentPlaybackTime();
      const totalDuration = this.getTotalDuration();

      if (this.isPlaying) {
        this.syncStep(currentTime);
      }

      if (!document.hidden) {
        this.updateProgressUI(currentTime, totalDuration);
      }
    };

    // 1. requestAnimationFrame for 60fps UI when window is visible
    const rafTick = () => {
      if (!document.hidden) {
        onTick();
      }
      requestAnimationFrame(rafTick);
    };
    requestAnimationFrame(rafTick);

    // 2. High-precision Web Worker timer (NEVER throttled or paused when minimized)
    try {
      const blobCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(() => self.postMessage('tick'), 30);
          } else if (e.data === 'stop') {
            if (timer) { clearInterval(timer); timer = null; }
          }
        };
      `;
      const blob = new Blob([blobCode], { type: "application/javascript" });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = () => {
        onTick();
      };
      worker.postMessage("start");
      this.bgWorker = worker;
    } catch (err) {
      console.warn("[LinguaFloat] Background WebWorker timer unavailable:", err);
    }

    // 3. Interval backup
    setInterval(() => {
      onTick();
    }, 40);

    // 4. Native audio timeupdate event (fires continuously from audio decoder thread in background)
    if (this.audio) {
      this.audio.addEventListener("timeupdate", () => {
        onTick();
      });
    }

    // 5. Visibility change handler: snap UI instantly when window is restored
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        const cur = this.getCurrentPlaybackTime();
        const dur = this.getTotalDuration();
        this.updateProgressUI(cur, dur);
        if (this.activeSegmentIndex !== -1) {
          this.scrollToSegment(this.activeSegmentIndex, false);
        }
      }
    });
  }

  getCurrentPlaybackTime() {
    if (this.activePlayerType === "yt" && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === "function") {
      try {
        return this.ytPlayer.getCurrentTime() || 0;
      } catch (e) {
        return 0;
      }
    } else if (this.activePlayerType === "audio" && this.audio && this.audio.src) {
      return this.audio.currentTime || 0;
    } else {
      // Clock / Demo mode
      if (this.isPlaying) {
        const elapsed = ((performance.now() - this.clockStartPerf) / 1000) * this.speeds[this.speedIndex];
        const t = this.clockOffsetSec + elapsed;
        if (t >= this.clockDurationSec) {
          this.pause();
          return this.clockDurationSec;
        }
        return t;
      }
      return this.clockOffsetSec;
    }
  }

  getTotalDuration() {
    if (this.activePlayerType === "yt" && this.ytPlayer && typeof this.ytPlayer.getDuration === "function") {
      try {
        return this.ytPlayer.getDuration() || 0;
      } catch (e) {
        return 0;
      }
    } else if (this.activePlayerType === "audio" && this.audio && this.audio.src && this.audio.duration) {
      return this.audio.duration;
    }
    return this.clockDurationSec;
  }

  // Binary search: Sync active word & paragraph in O(log N)
  syncStep(currentTime) {
    if (!this.words.length) return;

    const now = performance.now();
    const canLoopSeek = (now - this.lastLoopSeekTime) > 280;

    // Feature: Multi-Paragraph Range Loop (A-B)
    if (this.loopRange !== null && canLoopSeek) {
      const endSeg = this.segments[this.loopRange.end];
      const startSeg = this.segments[this.loopRange.start];
      // Note: Removed narrow upper-bound window so background ticks never miss boundary
      if (endSeg && startSeg && currentTime >= endSeg.end - 0.08) {
        const maxLoops = this.loopModes[this.loopModeIndex] > 0 ? this.loopModes[this.loopModeIndex] : Infinity;
        if (this.rangeLoopCount < maxLoops) {
          this.rangeLoopCount++;
          this.lastLoopSeekTime = now;
          this.seekTo(startSeg.start);
          this.setActiveSegment(this.loopRange.start, true);
          this.play();
          const targetStr = maxLoops === Infinity ? "∞" : maxLoops;
          this.statusHint.textContent = `§ ${this.loopRange.start + 1}–${this.loopRange.end + 1} (Loop ${this.rangeLoopCount}/${targetStr})`;
          return;
        } else {
          this.rangeLoopCount = 0;
          if (this.loopModes[this.loopModeIndex] > 0) {
            this.pause();
            this.statusHint.textContent = `Completed § ${this.loopRange.start + 1}–${this.loopRange.end + 1}`;
            return;
          }
        }
      }
    } else if (this.activeSegmentIndex !== -1 && this.loopModes[this.loopModeIndex] > 0 && canLoopSeek) {
      // Feature 3: Single paragraph Loop / Shadowing check at end of current paragraph
      const curSeg = this.segments[this.activeSegmentIndex];
      const maxLoops = this.loopModes[this.loopModeIndex];
      // Note: Removed narrow upper-bound window so background ticks never miss boundary
      if (curSeg && currentTime >= curSeg.end - 0.08) {
        if (this.currentSegmentRepeats < maxLoops) {
          this.currentSegmentRepeats++;
          this.lastLoopSeekTime = now;
          this.seekTo(curSeg.start);
          this.play();
          const targetStr = maxLoops === Infinity ? "∞" : maxLoops;
          this.statusHint.textContent = `§ ${this.activeSegmentIndex + 1} (Loop ${this.currentSegmentRepeats}/${targetStr})`;
          return;
        } else {
          this.currentSegmentRepeats = 0;
        }
      }
    }

    const newWordIndex = this.findWordAtTime(currentTime);

    if (newWordIndex !== this.activeWordIndex) {
      // Deactivate old word
      if (this.activeWordIndex !== -1 && this.wordDOMElements[this.activeWordIndex]) {
        this.wordDOMElements[this.activeWordIndex].classList.remove("active");
      }

      // Activate new word
      if (newWordIndex !== -1 && this.wordDOMElements[newWordIndex]) {
        const wordEl = this.wordDOMElements[newWordIndex];
        wordEl.classList.add("active");

        // Update active paragraph
        const wordData = this.words[newWordIndex];
        const segIdx = wordData ? wordData.seg : -1;
        this.setActiveSegment(segIdx);

        // Feature 8: Update ticker display if in ticker mode
        if (this.isTickerMode) {
          this.updateTickerDisplay(segIdx, newWordIndex);
        }
      }

      this.activeWordIndex = newWordIndex;
    }
  }

  syncWordByCharIndex(segId, charIndex) {
    const segWords = this.words.filter((w) => w.seg === segId);
    if (!segWords.length) return;

    let currentPos = 0;
    for (let i = 0; i < segWords.length; i++) {
      const w = segWords[i];
      const wordLen = w.w.length;
      if (charIndex >= currentPos && charIndex <= currentPos + wordLen + 1) {
        const globalIdx = w.id;
        if (globalIdx !== this.activeWordIndex) {
          if (this.activeWordIndex !== -1 && this.wordDOMElements[this.activeWordIndex]) {
            this.wordDOMElements[this.activeWordIndex].classList.remove("active");
          }
          if (this.wordDOMElements[globalIdx]) {
            this.wordDOMElements[globalIdx].classList.add("active");
          }
          this.activeWordIndex = globalIdx;
        }
        break;
      }
      currentPos += wordLen + 1;
    }
  }

  onUserInitiatedScroll() {
    if (!this.isUserBrowsing) {
      this.isUserBrowsing = true;
      this.updateScrollButtonState();
      if (this.statusHint && this.activeSegmentIndex !== -1) {
        this.statusHint.textContent = `Browsing • Click § to play from top`;
      }
    }
  }

  updateScrollButtonState() {
    if (!this.btnToggleScroll) return;
    this.btnToggleScroll.classList.toggle("active", this.autoScrollEnabled);
    this.btnToggleScroll.classList.toggle("browsing", this.isUserBrowsing);
    if (this.isUserBrowsing) {
      this.btnToggleScroll.title = "Browsing manually - Click to snap back to playing paragraph";
    } else {
      this.btnToggleScroll.title = this.autoScrollEnabled ? "Auto-scroll ON (Top mode)" : "Auto-scroll OFF";
    }
  }

  scrollToSegment(segIdx, smooth = true) {
    if (segIdx < 0 || !this.parrafoDOMElements[segIdx]) return;
    const el = this.parrafoDOMElements[segIdx];
    const container = this.transcriptContainer;
    if (!container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop = container.scrollTop + (elRect.top - containerRect.top) - 8;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: smooth ? "smooth" : "auto"
    });
  }

  setActiveSegment(segIdx, forceScroll = false) {
    if (segIdx === this.activeSegmentIndex && !forceScroll) return;

    if (this.activeSegmentIndex !== -1 && this.parrafoDOMElements[this.activeSegmentIndex]) {
      this.parrafoDOMElements[this.activeSegmentIndex].classList.remove("active-parrafo");
    }

    if (segIdx !== -1 && this.parrafoDOMElements[segIdx]) {
      const parrafoEl = this.parrafoDOMElements[segIdx];
      parrafoEl.classList.add("active-parrafo");

      // By default, the playing paragraph sits at the top of the reproducer
      // If user is manually browsing down, do not interrupt them unless forceScroll is true
      if (!document.hidden && this.autoScrollEnabled && (!this.isUserBrowsing || forceScroll)) {
        this.scrollToSegment(segIdx, true);
      }
    }

    this.activeSegmentIndex = segIdx;
  }

  findWordAtTime(t) {
    let low = 0;
    let high = this.words.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const w = this.words[mid];
      if (t < w.s) {
        high = mid - 1;
      } else if (t > w.e) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    // Near-match gap tolerance (e.g. 0.25s pause between words)
    if (high >= 0 && high < this.words.length) {
      if (t >= this.words[high].s && t <= this.words[high].e + 0.25) {
        return high;
      }
    }
    return -1;
  }

  /**
   * REPLAY PARAGRAPH
   * Stops current section, jumps to paragraph start, highlights and reproduces immediately
   */
  clickParagraph(segIdx) {
    if (segIdx < 0 || segIdx >= this.segments.length) return;

    // Reset manual browsing: clicking resumes top-aligned auto-follow from this paragraph
    this.isUserBrowsing = false;
    this.currentSegmentRepeats = 0; // Reset loop counter on manual paragraph jump
    this.updateScrollButtonState();

    const targetStart = this.segments[segIdx].start;

    // 1. Immediately STOP the current section
    this.stopCurrentPlayback();

    // 2. Clear old word highlight
    if (this.activeWordIndex !== -1 && this.wordDOMElements[this.activeWordIndex]) {
      this.wordDOMElements[this.activeWordIndex].classList.remove("active");
    }
    this.activeWordIndex = -1;

    // 3. Highlight this paragraph & scroll it directly to the top
    this.setActiveSegment(segIdx, true);

    // 4. Seek playback position to the start of this paragraph
    this.seekTo(targetStart);

    // 5. Highlight first word of this paragraph immediately
    const firstWord = this.words.find((w) => w.seg === segIdx);
    if (firstWord && this.wordDOMElements[firstWord.id]) {
      this.wordDOMElements[firstWord.id].classList.add("active");
      this.activeWordIndex = firstWord.id;
    }

    // 6. Start reproducing immediately
    this.play();

    this.statusHint.textContent = `§ ${segIdx + 1} (${this.formatTime(targetStart)})`;
  }

  stopCurrentPlayback() {
    if (this.activePlayerType === "yt" && this.ytPlayer) {
      try { this.ytPlayer.pauseVideo(); } catch (e) {}
    } else if (this.activePlayerType === "audio" && this.audio && this.audio.src) {
      try { this.audio.pause(); } catch (e) {}
    } else {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
    this.isPlaying = false;
  }

  seekTo(seconds) {
    seconds = Math.max(0, seconds);

    if (this.activePlayerType === "yt" && this.ytPlayer && typeof this.ytPlayer.seekTo === "function") {
      try {
        this.ytPlayer.seekTo(seconds, true);
      } catch (e) {}
    } else if (this.activePlayerType === "audio" && this.audio && this.audio.src) {
      try {
        this.audio.currentTime = seconds;
      } catch (e) {}
    } else {
      // Clock / Demo mode
      this.clockOffsetSec = seconds;
      this.clockStartPerf = performance.now();
    }
  }

  play() {
    this.isPlaying = true;
    this.btnPlayPause.textContent = "⏸";

    if (this.activePlayerType === "yt" && this.ytPlayer && typeof this.ytPlayer.playVideo === "function") {
      try { this.ytPlayer.playVideo(); } catch (e) {}
    } else if (this.activePlayerType === "audio" && this.audio && this.audio.src) {
      this.audio.play().catch(() => {});
    } else {
      // Clock / Demo mode with Web Speech
      this.clockStartPerf = performance.now();

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();

        const segIdx = this.activeSegmentIndex >= 0 ? this.activeSegmentIndex : 0;
        const activeSeg = this.segments[segIdx];

        if (activeSeg) {
          const utterance = new SpeechSynthesisUtterance(activeSeg.text);
          utterance.lang = "de-DE";
          utterance.rate = this.speeds[this.speedIndex];

          // Synchronize word boundaries during speech
          utterance.onboundary = (event) => {
            if (event.name === "word") {
              this.syncWordByCharIndex(segIdx, event.charIndex);
            }
          };

          utterance.onend = () => {
            this.pause();
            this.statusHint.textContent = `Finished § ${segIdx + 1} • Click to replay`;
          };

          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }

  pause() {
    this.stopCurrentPlayback();
    this.btnPlayPause.textContent = "▶";
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  handleProgressClick(e) {
    const rect = this.progressContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const total = this.getTotalDuration();
    if (total > 0) {
      const targetTime = ratio * total;
      this.seekTo(targetTime);
      this.syncStep(targetTime);
    }
  }

  cyclePlaybackSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.speeds.length;
    const speed = this.speeds[this.speedIndex];
    this.btnCycleSpeed.textContent = `${speed}x`;

    if (this.audio && this.audio.src) this.audio.playbackRate = speed;
    if (this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === "function") {
      this.ytPlayer.setPlaybackRate(speed);
    }
  }

  updateProgressUI(current, total) {
    this.timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(total)}`;
    if (total > 0) {
      const pct = Math.min(100, Math.max(0, (current / total) * 100));
      this.progressFill.style.width = `${pct}%`;
    }
  }

  // Render Transcript into Paragraphs (Parrafos)
  renderTranscript(data) {
    this.words = data.words || [];
    this.segments = data.segments || [];

    if (data.meta && data.meta.duration_sec) {
      this.clockDurationSec = data.meta.duration_sec;
    }

    this.transcriptContainer.innerHTML = "";
    this.wordDOMElements = [];
    this.parrafoDOMElements = [];

    this.segments.forEach((seg, sIdx) => {
      const parrafoEl = document.createElement("div");
      parrafoEl.className = "parrafo";
      parrafoEl.dataset.segId = sIdx;

      // Meta row (tag + timestamp)
      const metaRow = document.createElement("div");
      metaRow.className = "parrafo-meta";

      const tag = document.createElement("span");
      tag.className = "parrafo-tag";
      tag.textContent = `§ ${sIdx + 1} • ${this.formatTime(seg.start)}`;

      metaRow.appendChild(tag);
      parrafoEl.appendChild(metaRow);

      // Text container
      const textContainer = document.createElement("div");
      textContainer.className = "parrafo-text";
      parrafoEl.appendChild(textContainer);

      // Translation container (English subtitle)
      const transContainer = document.createElement("div");
      transContainer.className = "parrafo-translation";
      if (seg.translation) {
        transContainer.textContent = seg.translation;
      }
      transContainer.style.display = this.translationEnabled ? "block" : "none";
      parrafoEl.appendChild(transContainer);

      // Clicking ANYWHERE on the paragraph stops current section & starts reproducing it
      parrafoEl.addEventListener("click", (e) => {
        if (e.shiftKey) {
          this.handleShiftClickParagraph(sIdx);
        } else {
          this.handleParagraphClick(sIdx);
        }
      });

      this.transcriptContainer.appendChild(parrafoEl);
      this.parrafoDOMElements.push(parrafoEl);
    });

    // Populate words into their respective paragraphs
    this.words.forEach((w, wIdx) => {
      w.id = wIdx; // Ensure unambiguous id

      const span = document.createElement("span");
      span.className = "word";
      span.dataset.id = wIdx;
      span.textContent = w.w;

      // Feature 1: Classify noun gender (der/die/das)
      const gender = this.classifyNounGender(w.w);
      w.gender = gender;
      if (gender) {
        span.classList.add(`noun-${gender}`);
        span.title = gender === "m" ? "der (Masculine)" : gender === "f" ? "die (Feminine)" : "das (Neuter)";
      }

      // Clicking any word restarts both text and audio from the beginning of the paragraph
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
          this.handleShiftClickParagraph(w.seg);
        } else {
          this.handleParagraphClick(w.seg);
        }
      });

      const parentParrafo = this.parrafoDOMElements[w.seg];
      if (parentParrafo) {
        const textCont = parentParrafo.querySelector(".parrafo-text");
        textCont.appendChild(span);
        textCont.appendChild(document.createTextNode(" "));
      }

      this.wordDOMElements.push(span);
    });

    // Reset state to first paragraph at top
    this.activeWordIndex = -1;
    this.activeSegmentIndex = -1;
    this.isUserBrowsing = false;
    this.currentSegmentRepeats = 0;
    this.clearLoopRange();
    this.updateScrollButtonState();
    this.transcriptContainer.classList.toggle("genders-enabled", this.gendersEnabled);
    if (this.segments.length > 0) {
      this.setActiveSegment(0, true);
    }
    if (this.translationEnabled) {
      this.fetchLessonTranslationsIfNeeded();
    }
  }

  showLoader(title, subtitle) {
    if (this.loaderOverlay) {
      this.loaderTitle.textContent = title || "Processing Audio...";
      this.loaderSub.textContent = subtitle || "Connecting...";
      this.loaderBar.style.width = "0%";
      this.loaderPct.textContent = "0%";
      this.loaderOverlay.style.display = "flex";
    }
  }

  setLoaderProgress(pct, subtitle) {
    if (this.loaderBar && this.loaderPct) {
      const clamped = Math.min(100, Math.max(0, pct));
      this.loaderBar.style.width = `${clamped}%`;
      this.loaderPct.textContent = `${Math.round(clamped)}%`;
    }
    if (subtitle && this.loaderSub) {
      this.loaderSub.textContent = subtitle;
    }
  }

  hideLoader() {
    if (this.loaderInterval) {
      clearInterval(this.loaderInterval);
      this.loaderInterval = null;
    }
    if (this.loaderOverlay) {
      this.loaderOverlay.style.display = "none";
    }
  }

  async processYouTubeUrl() {
    const url = this.ytUrlInput.value.trim();
    if (!url) return;

    this.urlModal.style.display = "none";
    this.showLoader("Processing German Audio", "Connecting to YouTube stream...");

    // Simulated stepped progress while server downloads and transcribes
    let simulatedPct = 5;
    this.setLoaderProgress(simulatedPct, "Downloading audio stream...");

    this.loaderInterval = setInterval(() => {
      if (simulatedPct < 35) {
        simulatedPct += 3;
        this.setLoaderProgress(simulatedPct, "Downloading audio stream (.m4a)...");
      } else if (simulatedPct < 85) {
        simulatedPct += 1.5;
        this.setLoaderProgress(simulatedPct, "Whisper AI transcribing German words & VAD...");
      } else if (simulatedPct < 96) {
        simulatedPct += 0.5;
        this.setLoaderProgress(simulatedPct, "Aligning word timestamps...");
      }
    }, 400);

    try {
      const res = await fetch("/api/process-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Processing failed on server (${res.status})`);

      // Finish progress to 100%
      clearInterval(this.loaderInterval);
      this.setLoaderProgress(100, "Done! Interactive script ready.");

      setTimeout(() => {
        this.hideLoader();

        if (data.transcript) {
          const lessonId = data.video_id || (data.transcript && data.transcript.meta && data.transcript.meta.id) || (data.title || "YouTube Audio");
          this.currentLoadedId = lessonId;
          this.headerTitle.textContent = data.title || "YouTube Audio";
          this.headerTitle.classList.add("has-lesson");
          this.headerTitle.title = "Click to rename active lesson";
          this.renderTranscript(data.transcript);

          if (data.audio_url) {
            this.activePlayerType = "audio";
            this.audio.src = data.audio_url;
            this.audio.load();
          } else if (data.video_id) {
            this.mountYouTubeVideo(data.video_id);
          }

          this.statusHint.textContent = "Ready • Click paragraph to play";
          this.play();
        }
      }, 500);

    } catch (err) {
      clearInterval(this.loaderInterval);
      console.warn("API error:", err);
      this.setLoaderProgress(0, `Error: ${err.message || "Could not process audio"}`);
      this.loaderTitle.textContent = "Processing Failed";
      this.statusHint.textContent = `Error: ${err.message || "Check URL or main.py terminal"}`;

      setTimeout(() => {
        this.hideLoader();
      }, 3500);
    }
  }

  mountYouTubeVideo(videoId) {
    const container = document.getElementById("yt-player-container");
    container.style.display = "block";
    this.activePlayerType = "yt";

    if (this.ytPlayer) {
      this.ytPlayer.loadVideoById(videoId);
    } else if (window.YT && window.YT.Player) {
      this.ytPlayer = new window.YT.Player("yt-player", {
        height: "60",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1
        },
        events: {
          onStateChange: (event) => {
            if (event.data === 1) { // Playing
              this.isPlaying = true;
              this.btnPlayPause.textContent = "⏸";
            } else if (event.data === 2) { // Paused
              this.isPlaying = false;
              this.btnPlayPause.textContent = "▶";
            }
          }
        }
      });
    }
  }

  async openLibraryModal() {
    if (!this.libraryModal) return;
    this.libraryModal.style.display = "flex";
    await this.fetchSavedDownloads();
  }

  async fetchSavedDownloads() {
    if (!this.libraryList) return;
    this.libraryList.innerHTML = '<div class="library-loading">Loading saved lessons...</div>';

    try {
      const res = await fetch("/api/list-downloads");
      if (!res.ok) throw new Error("Could not load downloads");
      const data = await res.json();
      const items = data.items || [];

      if (!items.length) {
        this.libraryList.innerHTML = '<div class="library-empty">No saved lessons in downloads/<br><span style="font-size:9px;color:var(--text-muted)">Load a YouTube link to save lessons</span></div>';
        return;
      }

      this.libraryList.innerHTML = "";
      items.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = "library-item";

        const info = document.createElement("div");
        info.className = "library-item-info";

        const title = document.createElement("span");
        title.className = "library-item-title";
        title.textContent = item.title;

        const meta = document.createElement("span");
        meta.className = "library-item-meta";
        const dur = this.formatTime(item.duration_sec);
        meta.textContent = `${dur} • ${item.words || 0} words`;

        info.appendChild(title);
        info.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "library-item-actions";

        const renameBtn = document.createElement("button");
        renameBtn.className = "library-btn-rename";
        renameBtn.title = "Rename lesson & audio file";
        renameBtn.textContent = "✏️";
        renameBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.promptRenameLesson(item);
        });

        const playBtn = document.createElement("button");
        playBtn.className = "library-play-btn";
        playBtn.textContent = "▶ Load";
        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.loadSavedItem(item);
        });

        actions.appendChild(renameBtn);
        actions.appendChild(playBtn);

        itemEl.appendChild(info);
        itemEl.appendChild(actions);

        itemEl.addEventListener("click", () => this.loadSavedItem(item));

        this.libraryList.appendChild(itemEl);
      });
    } catch (err) {
      this.libraryList.innerHTML = '<div class="library-empty">Failed to load downloads list</div>';
    }
  }

  promptRenameLesson(item) {
    this.openRenameModal(item);
  }

  openRenameModal(item) {
    this.pendingRenameItem = item;
    const currentName = item.title || item.id || "";
    if (this.renameInput) {
      this.renameInput.value = currentName;
    }
    if (this.renameError) {
      this.renameError.style.display = "none";
      this.renameError.textContent = "";
    }
    if (this.renameModal) {
      this.renameModal.style.display = "flex";
      setTimeout(() => {
        if (this.renameInput) {
          this.renameInput.focus();
          this.renameInput.select();
        }
      }, 50);
    }
  }

  closeRenameModal() {
    if (this.renameModal) {
      this.renameModal.style.display = "none";
    }
    this.pendingRenameItem = null;
  }

  async confirmRenameLesson() {
    if (!this.pendingRenameItem || !this.renameInput) return;
    const currentName = this.pendingRenameItem.title || this.pendingRenameItem.id;
    const newName = this.renameInput.value.trim();

    if (!newName) {
      this.showRenameError("Lesson name cannot be empty");
      return;
    }

    if (newName === currentName) {
      this.closeRenameModal();
      return;
    }

    if (this.btnConfirmRename) {
      this.btnConfirmRename.disabled = true;
      this.btnConfirmRename.textContent = "Renaming...";
    }
    this.statusHint.textContent = `Renaming "${currentName}" -> "${newName}"...`;

    try {
      const res = await fetch("/api/rename-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_id: this.pendingRenameItem.id,
          new_name: newName
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to rename");
      }

      this.closeRenameModal();
      this.statusHint.textContent = `Renamed to ${data.new_title}!`;

      // If currently loaded lesson matches, update title & audio src smoothly
      if (this.currentLoadedId === this.pendingRenameItem.id || this.headerTitle.textContent === currentName) {
        this.currentLoadedId = data.new_id;
        this.headerTitle.textContent = data.new_title;
        if (data.audio_url && this.audio) {
          const wasPlaying = this.isPlaying;
          const currTime = this.audio.currentTime || 0;
          this.audio.src = data.audio_url;
          this.audio.currentTime = currTime;
          if (wasPlaying) this.play();
        }
      }

      // Refresh library list
      await this.fetchSavedDownloads();
    } catch (err) {
      this.showRenameError(err.message || "Failed to rename lesson");
      this.statusHint.textContent = "Rename failed";
    } finally {
      if (this.btnConfirmRename) {
        this.btnConfirmRename.disabled = false;
        this.btnConfirmRename.textContent = "Rename";
      }
    }
  }

  showRenameError(msg) {
    if (this.renameError) {
      this.renameError.textContent = msg;
      this.renameError.style.display = "block";
    }
  }

  // --- Translation Feature Methods ---
  toggleTranslation() {
    this.translationEnabled = !this.translationEnabled;
    if (this.btnToggleTranslation) {
      this.btnToggleTranslation.classList.toggle("active", this.translationEnabled);
    }

    // Toggle visibility of all paragraph translation lines
    const transEls = this.transcriptContainer.querySelectorAll(".parrafo-translation");
    transEls.forEach((el) => {
      el.style.display = this.translationEnabled ? "block" : "none";
    });

    if (this.translationEnabled) {
      this.statusHint.textContent = "English subtitles ON";
      this.fetchLessonTranslationsIfNeeded();
    } else {
      this.statusHint.textContent = "English subtitles OFF";
    }
  }

  async fetchLessonTranslationsIfNeeded() {
    if (!this.segments || !this.segments.length || this.isTranslatingBatch) return;

    // Check if any segment is missing a translation or has identical German text
    const isUntranslated = (seg) => !seg.translation || (seg.text && seg.text.length > 6 && seg.translation.trim().toLowerCase() === seg.text.trim().toLowerCase());
    const missing = this.segments.some(isUntranslated);
    if (!missing) {
      // All already translated, ensure DOM elements are populated
      this.segments.forEach((seg, idx) => {
        const parEl = this.parrafoDOMElements[idx];
        if (parEl) {
          const tEl = parEl.querySelector(".parrafo-translation");
          if (tEl && seg.translation) tEl.textContent = seg.translation;
        }
      });
      return;
    }

    this.isTranslatingBatch = true;
    this.statusHint.textContent = "Translating text to English...";

    // Show shimmering state on paragraphs that lack translations
    this.segments.forEach((seg, idx) => {
      if (isUntranslated(seg)) {
        const parEl = this.parrafoDOMElements[idx];
        if (parEl) {
          const tEl = parEl.querySelector(".parrafo-translation");
          if (tEl) {
            tEl.textContent = "Translating...";
            tEl.classList.add("translating");
          }
        }
      }
    });

    try {
      const texts = this.segments.map((s) => s.text || "");
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts,
          lesson_id: this.currentLoadedId
        })
      });

      const data = await res.json();
      if (res.ok && data.translations) {
        data.translations.forEach((tr, idx) => {
          if (this.segments[idx]) {
            this.segments[idx].translation = tr;
          }
          const parEl = this.parrafoDOMElements[idx];
          if (parEl) {
            const tEl = parEl.querySelector(".parrafo-translation");
            if (tEl) {
              tEl.textContent = tr;
              tEl.classList.remove("translating");
            }
          }
        });
        this.statusHint.textContent = "English translation ready";
      } else {
        throw new Error(data.error || "Translation request failed");
      }
    } catch (err) {
      console.warn("Translation batch error:", err);
      this.statusHint.textContent = "Translation offline/error";
      this.segments.forEach((seg, idx) => {
        const parEl = this.parrafoDOMElements[idx];
        if (parEl) {
          const tEl = parEl.querySelector(".parrafo-translation");
          if (tEl && tEl.classList.contains("translating")) {
            tEl.textContent = "(Translation unavailable)";
            tEl.classList.remove("translating");
          }
        }
      });
    } finally {
      this.isTranslatingBatch = false;
    }
  }

  async handleTextSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const rawText = sel.toString().trim();
    if (!rawText || rawText.length < 2 || rawText.length > 200) return;

    // Check if selection is within transcriptContainer
    try {
      const range = sel.getRangeAt(0);
      if (!this.transcriptContainer.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      this.showExpressionPopover(rawText, rect);
    } catch (e) {
      // Ignore selection errors
    }
  }

  async showExpressionPopover(text, rect) {
    if (!this.expressionPopover) return;

    if (this.popoverDeText) this.popoverDeText.textContent = text;
    if (this.popoverEnText) this.popoverEnText.textContent = "Translating...";
    this.expressionPopover.style.display = "block";

    // Position popover intelligently near selection
    const popoverWidth = 200;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - popoverWidth - 10));

    let top = rect.top - 58;
    if (top < 32) {
      top = rect.bottom + 6;
    }

    this.expressionPopover.style.left = `${left}px`;
    this.expressionPopover.style.top = `${top}px`;

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (res.ok && data.translated) {
        if (this.popoverEnText) this.popoverEnText.textContent = data.translated;
      } else {
        if (this.popoverEnText) this.popoverEnText.textContent = "(Could not translate)";
      }
    } catch (e) {
      if (this.popoverEnText) this.popoverEnText.textContent = "(Translation error)";
    }
  }

  hideExpressionPopover() {
    if (this.expressionPopover) {
      this.expressionPopover.style.display = "none";
    }
  }

  async loadSavedItem(item) {
    if (this.libraryModal) this.libraryModal.style.display = "none";
    this.statusHint.textContent = `Loading ${item.title}...`;

    try {
      const res = await fetch(item.json_url);
      if (!res.ok) throw new Error("Could not load transcript JSON");
      const transcriptData = await res.json();

      this.currentLoadedId = item.id;
      this.headerTitle.textContent = item.title;
      this.headerTitle.classList.add("has-lesson");
      this.headerTitle.title = "Click to rename active lesson";
      this.renderTranscript(transcriptData);

      if (item.audio_url) {
        this.activePlayerType = "audio";
        this.audio.src = item.audio_url;
        this.audio.load();
      }

      this.statusHint.textContent = `Ready • ${item.title}`;
      this.play();
    } catch (err) {
      console.error(err);
      this.statusHint.textContent = "Error loading saved lesson";
    }
  }

  async loadLocalPaths(paths) {
    this.statusHint.textContent = "Loading file from disk...";
    try {
      const res = await fetch("/api/load-local-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Could not load selected file");
      }

      if (data.needs_transcription) {
        const doTranscribe = confirm(`"${data.filename}" does not have a transcript yet.\n\nTranscribe with Whisper AI to generate synchronized German text?`);
        if (doTranscribe) {
          await this.transcribeExistingServerFile(data.filename);
        } else {
          this.activePlayerType = "audio";
          this.audio.src = data.audio_url;
          this.audio.load();
          this.headerTitle.textContent = data.title;
          this.statusHint.textContent = "Audio loaded (no text)";
        }
        return;
      }

      if (data.transcript) {
        this.currentLoadedId = data.title;
        this.headerTitle.textContent = data.title;
        this.headerTitle.classList.add("has-lesson");
        this.headerTitle.title = "Click to rename active lesson";
        this.renderTranscript(data.transcript);
        if (data.audio_url) {
          this.activePlayerType = "audio";
          this.audio.src = data.audio_url;
          this.audio.load();
        }
        this.statusHint.textContent = `Ready • ${data.title}`;
        this.play();
      }
    } catch (err) {
      console.error(err);
      this.statusHint.textContent = `Error: ${err.message}`;
    }
  }

  async transcribeExistingServerFile(filename) {
    this.showLoader("Transcribing Audio", `Running Whisper AI on ${filename}...`);
    this.setLoaderProgress(15, "Whisper AI processing audio...");

    let simulatedPct = 15;
    this.loaderInterval = setInterval(() => {
      if (simulatedPct < 85) {
        simulatedPct += 2;
        this.setLoaderProgress(simulatedPct, "Whisper AI transcribing German words & VAD...");
      } else if (simulatedPct < 96) {
        simulatedPct += 0.5;
        this.setLoaderProgress(simulatedPct, "Aligning word timestamps...");
      }
    }, 450);

    try {
      const res = await fetch("/api/transcribe-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Transcription failed");

      clearInterval(this.loaderInterval);
      this.setLoaderProgress(100, "Done! Interactive script ready.");

      setTimeout(() => {
        this.hideLoader();
        if (data.transcript) {
          this.currentLoadedId = data.title;
          this.headerTitle.textContent = data.title;
          this.headerTitle.classList.add("has-lesson");
          this.headerTitle.title = "Click to rename active lesson";
          this.renderTranscript(data.transcript);
          if (data.audio_url) {
            this.activePlayerType = "audio";
            this.audio.src = data.audio_url;
            this.audio.load();
          }
          this.statusHint.textContent = "Ready • Click paragraph to play";
          this.play();
        }
      }, 500);
    } catch (err) {
      clearInterval(this.loaderInterval);
      console.warn("Transcribe error:", err);
      this.setLoaderProgress(0, `Error: ${err.message || "transcribing audio"}`);
      this.loaderTitle.textContent = "Transcription Failed";
      this.statusHint.textContent = `Error: ${err.message || "Check terminal"}`;
      setTimeout(() => this.hideLoader(), 3500);
    }
  }

  async handleLocalFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = ""; // Reset so re-selecting same file triggers event

    let audioFile = files.find(f => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name));
    let jsonFile = files.find(f => f.name.endsWith(".json"));

    // Case 1: Both audio and JSON selected together
    if (audioFile && jsonFile) {
      await this.readAndRenderJson(jsonFile);
      this.loadAudioBlob(audioFile);
      return;
    }

    // Case 2: Only JSON file was selected
    if (jsonFile && !audioFile) {
      const parsed = await this.readAndRenderJson(jsonFile);
      if (parsed && parsed.meta && parsed.meta.audio_file) {
        const audioName = parsed.meta.audio_file;
        this.activePlayerType = "audio";
        this.audio.src = `/downloads/${encodeURIComponent(audioName)}`;
        this.audio.load();
        this.headerTitle.textContent = (parsed.meta && parsed.meta.title) || audioName;
        this.statusHint.textContent = `Ready • ${audioName}`;
      }
      return;
    }

    // Case 3: Only audio file was selected
    if (audioFile) {
      this.loadAudioBlob(audioFile);

      // Automatically search for companion transcript in downloads/
      const baseStem = audioFile.name.replace(/\.[^/.]+$/, "");
      const companionJsonUrl = `/downloads/${encodeURIComponent(baseStem)}_transcript.json`;

      try {
        const res = await fetch(companionJsonUrl);
        if (res.ok) {
          const transcriptData = await res.json();
          this.renderTranscript(transcriptData);
          this.statusHint.textContent = `Loaded audio & companion transcript for ${baseStem}`;
          return;
        }
      } catch (err) {
        console.warn("No companion transcript on server:", err);
      }

      this.statusHint.textContent = "Audio loaded • Checking for transcript...";

      // If no companion transcript on server, prompt user to transcribe with Whisper AI
      setTimeout(async () => {
        const doTranscribe = confirm(`"${audioFile.name}" does not have a transcript yet.\n\nTranscribe with Whisper AI to generate synchronized word-level German text?`);
        if (doTranscribe) {
          await this.uploadAndTranscribeLocal(audioFile);
        } else {
          this.statusHint.textContent = "Audio loaded (no text)";
        }
      }, 100);
    }
  }

  loadAudioBlob(file) {
    this.activePlayerType = "audio";
    this.audio.src = URL.createObjectURL(file);
    this.audio.load();
    this.headerTitle.textContent = file.name;
    this.play();
  }

  readAndRenderJson(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          this.renderTranscript(parsed);
          this.headerTitle.textContent = (parsed.meta && parsed.meta.title) || file.name;
          this.statusHint.textContent = `Loaded: ${file.name}`;
          resolve(parsed);
        } catch (err) {
          this.statusHint.textContent = "Invalid JSON file";
          resolve(null);
        }
      };
      reader.readAsText(file);
    });
  }

  loadInitialDemo() {
    this.activePlayerType = "clock";
    this.clockOffsetSec = 0;

    const demo = {
      meta: {
        audio_file: "Deutsch_A1_GutenMorgen",
        duration_sec: 16.5,
        language: "de"
      },
      segments: [
        {
          id: 0,
          start: 0.0,
          end: 3.4,
          text: "Hallo und herzlich willkommen zum Deutschlernen."
        },
        {
          id: 1,
          start: 3.5,
          end: 7.8,
          text: "Klicke einfach auf einen Absatz, um ihn sofort von vorne anzuhören."
        },
        {
          id: 2,
          start: 8.0,
          end: 12.0,
          text: "Der Text folgt dem Audio in Echtzeit und hebt jedes Wort hervor."
        },
        {
          id: 3,
          start: 12.2,
          end: 16.2,
          text: "So kannst du schwierige Sätze ganz einfach wiederholen."
        }
      ],
      words: [
        { w: "Hallo", s: 0.0, e: 0.5, seg: 0 },
        { w: "und", s: 0.55, e: 0.75, seg: 0 },
        { w: "herzlich", s: 0.8, e: 1.3, seg: 0 },
        { w: "willkommen", s: 1.35, e: 2.1, seg: 0 },
        { w: "zum", s: 2.15, e: 2.4, seg: 0 },
        { w: "Deutschlernen.", s: 2.45, e: 3.4, seg: 0 },

        { w: "Klicke", s: 3.5, e: 3.9, seg: 1 },
        { w: "einfach", s: 3.95, e: 4.4, seg: 1 },
        { w: "auf", s: 4.45, e: 4.65, seg: 1 },
        { w: "einen", s: 4.7, e: 5.0, seg: 1 },
        { w: "Absatz,", s: 5.05, e: 5.6, seg: 1 },
        { w: "um", s: 5.65, e: 5.85, seg: 1 },
        { w: "ihn", s: 5.9, e: 6.1, seg: 1 },
        { w: "sofort", s: 6.15, e: 6.65, seg: 1 },
        { w: "von", s: 6.7, e: 6.9, seg: 1 },
        { w: "vorne", s: 6.95, e: 7.3, seg: 1 },
        { w: "anzuhören.", s: 7.35, e: 7.8, seg: 1 },

        { w: "Der", s: 8.0, e: 8.25, seg: 2 },
        { w: "Text", s: 8.3, e: 8.65, seg: 2 },
        { w: "folgt", s: 8.7, e: 9.05, seg: 2 },
        { w: "dem", s: 9.1, e: 9.3, seg: 2 },
        { w: "Audio", s: 9.35, e: 9.8, seg: 2 },
        { w: "in", s: 9.85, e: 10.05, seg: 2 },
        { w: "Echtzeit", s: 10.1, e: 10.7, seg: 2 },
        { w: "und", s: 10.75, e: 10.95, seg: 2 },
        { w: "hebt", s: 11.0, e: 11.3, seg: 2 },
        { w: "jedes", s: 11.35, e: 11.65, seg: 2 },
        { w: "Wort", s: 11.7, e: 11.95, seg: 2 },
        { w: "hervor.", s: 12.0, e: 12.0, seg: 2 },

        { w: "So", s: 12.2, e: 12.5, seg: 3 },
        { w: "kannst", s: 12.55, e: 12.9, seg: 3 },
        { w: "du", s: 12.95, e: 13.15, seg: 3 },
        { w: "schwierige", s: 13.2, e: 13.8, seg: 3 },
        { w: "Sätze", s: 13.85, e: 14.3, seg: 3 },
        { w: "ganz", s: 14.35, e: 14.65, seg: 3 },
        { w: "einfach", s: 14.7, e: 15.2, seg: 3 },
        { w: "wiederholen.", s: 15.25, e: 16.2, seg: 3 }
      ]
    };

    this.renderTranscript(demo);
  }

  async uploadAndTranscribeLocal(file) {
    this.showLoader("Transcribing Audio", `Running Whisper AI on ${file.name}...`);
    this.setLoaderProgress(10, "Uploading local file to engine...");

    let simulatedPct = 10;
    this.loaderInterval = setInterval(() => {
      if (simulatedPct < 40) {
        simulatedPct += 4;
        this.setLoaderProgress(simulatedPct, "Uploading audio stream...");
      } else if (simulatedPct < 85) {
        simulatedPct += 1.5;
        this.setLoaderProgress(simulatedPct, "Whisper AI transcribing German words & VAD...");
      } else if (simulatedPct < 96) {
        simulatedPct += 0.5;
        this.setLoaderProgress(simulatedPct, "Aligning word timestamps...");
      }
    }, 450);

    try {
      const res = await fetch("/api/transcribe-local", {
        method: "POST",
        headers: {
          "X-Filename": encodeURIComponent(file.name),
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Local transcription failed on server (${res.status})`);

      clearInterval(this.loaderInterval);
      this.setLoaderProgress(100, "Done! Interactive script ready.");

      setTimeout(() => {
        this.hideLoader();
        if (data.transcript) {
          const stemName = (data.title || file.name).replace(/\.[^/.]+$/, "");
          this.currentLoadedId = stemName;
          this.headerTitle.textContent = data.title || file.name;
          this.headerTitle.classList.add("has-lesson");
          this.headerTitle.title = "Click to rename active lesson";
          this.renderTranscript(data.transcript);
          if (data.audio_url) {
            this.activePlayerType = "audio";
            this.audio.src = data.audio_url;
            this.audio.load();
          }
          this.statusHint.textContent = "Ready • Click paragraph to play";
          this.play();
        }
      }, 500);
    } catch (err) {
      clearInterval(this.loaderInterval);
      console.warn("Transcribe error:", err);
      this.setLoaderProgress(0, `Error: ${err.message || "transcribing audio"}`);
      this.loaderTitle.textContent = "Transcription Failed";
      this.statusHint.textContent = `Error: ${err.message || "Check terminal"}`;
      setTimeout(() => this.hideLoader(), 3500);
    }
  }

  classifyNounGender(rawWord) {
    if (!rawWord) return null;
    const clean = rawWord.replace(/^[„“"'\(\[\{]+|[.,!?:;"'\)\]\}]+$/g, "");
    if (!clean || clean.length < 2) return null;

    // German nouns are capitalized
    if (!/^[A-ZÄÖÜ]/.test(clean)) return null;

    const lower = clean.toLowerCase();

    // 1. Suffix rules (High precision in German grammar)
    if (/(ung|heit|keit|schaft|tion|sion|tät|ik|ie|enz|anz|ur)$/.test(lower)) {
      return "f";
    }
    if (/(ling|ismus|ist|ant|ent|eur|iker|or)$/.test(lower)) {
      return "m";
    }
    if (/(chen|lein|ment|um|ma|tum)$/.test(lower)) {
      return "n";
    }

    // 2. High-frequency irregular core nouns dictionary
    const MASC_NOUNS = new Set([
      "mann", "tag", "name", "tisch", "vater", "junge", "sohn", "freund", "hund",
      "baum", "weg", "stuhl", "morgen", "abend", "monat", "kaffee", "tee", "apfel",
      "lehrer", "kopf", "arm", "fuß", "satz", "arzt", "herbst", "sommer", "winter",
      "frühling", "berg", "ort", "schüler", "bruder", "onkel", "kollege", "chef"
    ]);

    const FEM_NOUNS = new Set([
      "frau", "mutter", "zeit", "hand", "nacht", "stadt", "sprache", "schule",
      "frage", "musik", "tür", "sonne", "straße", "katze", "tasche", "blume",
      "welt", "schwester", "tochter", "küche", "wohnung", "ärztin", "lehrerin",
      "stunde", "woche", "seite", "minuten", "antwort", "idee", "nummer", "familie"
    ]);

    const NEUT_NOUNS = new Set([
      "kind", "haus", "auto", "buch", "wasser", "bild", "fenster", "wort",
      "jahr", "auge", "land", "brot", "geld", "zimmer", "spiel", "essen",
      "mädchen", "problem", "beispiel", "ende", "glas", "hotel", "bett",
      "leben", "ziel", "thema", "deutsch", "herz", "wetter"
    ]);

    if (MASC_NOUNS.has(lower)) return "m";
    if (FEM_NOUNS.has(lower)) return "f";
    if (NEUT_NOUNS.has(lower)) return "n";

    return null;
  }

  toggleGenderHighlighting() {
    this.gendersEnabled = !this.gendersEnabled;
    if (this.btnToggleGender) {
      this.btnToggleGender.classList.toggle("active", this.gendersEnabled);
    }
    if (this.transcriptContainer) {
      this.transcriptContainer.classList.toggle("genders-enabled", this.gendersEnabled);
    }
    this.statusHint.textContent = this.gendersEnabled ? "Genders ON (🔵/🔴/🟢)" : "Genders OFF";
  }

  cycleLoopMode() {
    this.loopModeIndex = (this.loopModeIndex + 1) % this.loopModes.length;
    const mode = this.loopModes[this.loopModeIndex];
    this.currentSegmentRepeats = 0;

    if (this.btnCycleLoop) {
      this.btnCycleLoop.classList.toggle("looping", mode > 0);
      if (mode === 0) {
        this.btnCycleLoop.textContent = "🔁";
        this.statusHint.textContent = "Loop §: OFF";
      } else if (mode === Infinity) {
        this.btnCycleLoop.textContent = "🔁 ∞";
        this.statusHint.textContent = "Loop §: Infinite (Shadowing)";
      } else {
        this.btnCycleLoop.textContent = `🔁 ${mode}x`;
        this.statusHint.textContent = `Loop §: Repeat ${mode}x`;
      }
    }
  }

  // Multi-Paragraph Range Loop (A-B) Methods
  toggleAbMode() {
    if (this.loopRange) {
      this.clearLoopRange();
      return;
    }

    if (this.abSelectionStep === 0) {
      this.abSelectionStep = 1;
      this.abPendingStart = -1;
      if (this.btnAbLoop) this.btnAbLoop.classList.add("range-active");
      this.statusHint.textContent = "A-B: Click Start § [A]";
    } else {
      this.abSelectionStep = 0;
      this.abPendingStart = -1;
      if (this.btnAbLoop) this.btnAbLoop.classList.remove("range-active");
      this.updateLoopRangeUI();
      this.statusHint.textContent = "A-B: Cancelled";
    }
  }

  handleParagraphClick(segIdx) {
    if (this.abSelectionStep === 1) {
      this.abPendingStart = segIdx;
      this.abSelectionStep = 2;
      this.updateLoopRangeUI();
      this.statusHint.textContent = `A-B: [A] = § ${segIdx + 1}. Click End § [B]`;
      return;
    }
    if (this.abSelectionStep === 2) {
      const start = Math.min(this.abPendingStart, segIdx);
      const end = Math.max(this.abPendingStart, segIdx);
      this.abSelectionStep = 0;
      this.abPendingStart = -1;
      this.setLoopRange(start, end);
      this.clickParagraph(start);
      return;
    }
    this.clickParagraph(segIdx);
  }

  handleShiftClickParagraph(segIdx) {
    let anchor = this.activeSegmentIndex >= 0 ? this.activeSegmentIndex : 0;
    if (this.loopRange) {
      anchor = this.loopRange.start;
    }
    const start = Math.min(anchor, segIdx);
    const end = Math.max(anchor, segIdx);
    this.setLoopRange(start, end);
    this.clickParagraph(start);
  }

  setLoopRange(startIdx, endIdx) {
    if (!this.segments || this.segments.length === 0) return;
    const start = Math.max(0, Math.min(startIdx, endIdx));
    const end = Math.min(this.segments.length - 1, Math.max(startIdx, endIdx));
    this.loopRange = { start, end };
    this.rangeLoopCount = 0;
    this.updateLoopRangeUI();
    this.statusHint.textContent = `Looping § ${start + 1}–${end + 1} (Shift+Click to change)`;
  }

  clearLoopRange() {
    this.loopRange = null;
    this.abSelectionStep = 0;
    this.abPendingStart = -1;
    this.rangeLoopCount = 0;
    this.updateLoopRangeUI();
    if (this.statusHint) this.statusHint.textContent = "Loop range cleared";
  }

  updateLoopRangeUI() {
    if (this.btnAbLoop) {
      this.btnAbLoop.classList.toggle("range-active", !!this.loopRange || this.abSelectionStep > 0);
      if (this.loopRange) {
        this.btnAbLoop.title = `Looping § ${this.loopRange.start + 1}–${this.loopRange.end + 1} (Click to clear)`;
      } else {
        this.btnAbLoop.title = "Multi-Paragraph Loop (Shift+Click or click here)";
      }
    }

    if (this.rangeBadge) {
      if (this.loopRange) {
        this.rangeBadge.style.display = "inline-block";
        this.rangeBadge.textContent = `🔁 § ${this.loopRange.start + 1}–${this.loopRange.end + 1} ✕`;
      } else {
        this.rangeBadge.style.display = "none";
      }
    }

    this.parrafoDOMElements.forEach((el, idx) => {
      el.classList.remove("in-loop-range", "loop-range-start", "loop-range-end");
      const tag = el.querySelector(".parrafo-tag");
      if (tag) {
        const badges = tag.querySelectorAll(".loop-range-badge");
        badges.forEach((b) => b.remove());
      }

      if (this.loopRange && idx >= this.loopRange.start && idx <= this.loopRange.end) {
        el.classList.add("in-loop-range");

        if (tag) {
          if (idx === this.loopRange.start) {
            el.classList.add("loop-range-start");
            const badgeA = document.createElement("span");
            badgeA.className = "loop-range-badge";
            badgeA.textContent = "[A]";
            tag.prepend(badgeA);
          }
          if (idx === this.loopRange.end) {
            el.classList.add("loop-range-end");
            const badgeB = document.createElement("span");
            badgeB.className = "loop-range-badge";
            badgeB.textContent = "[B]";
            tag.appendChild(badgeB);
          }
        }
      } else if (!this.loopRange && this.abSelectionStep === 2 && idx === this.abPendingStart) {
        el.classList.add("loop-range-start");
        if (tag) {
          const badgeA = document.createElement("span");
          badgeA.className = "loop-range-badge";
          badgeA.textContent = "[A?]";
          tag.prepend(badgeA);
        }
      }
    });
  }

  toggleTickerMode() {
    this.isTickerMode = !this.isTickerMode;
    if (this.miniAppContainer) {
      this.miniAppContainer.classList.toggle("ticker-active", this.isTickerMode);
    }
    if (this.btnToggleTicker) {
      this.btnToggleTicker.classList.toggle("active", this.isTickerMode);
      this.btnToggleTicker.textContent = this.isTickerMode ? "⤡" : "⤢";
    }

    try {
      if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.resize_window === "function") {
        window.pywebview.api.resize_window(340, this.isTickerMode ? 48 : 270);
      }
    } catch (e) {
      console.warn("Resize error:", e);
    }

    if (this.isTickerMode && this.activeSegmentIndex !== -1) {
      this.updateTickerDisplay(this.activeSegmentIndex, this.activeWordIndex);
    }

    this.statusHint.textContent = this.isTickerMode ? "Ticker Mode (36px)" : "Full Mode (270px)";
  }

  updateTickerDisplay(segIdx, wordIdx) {
    if (!this.tickerWordsMount || segIdx < 0 || segIdx >= this.segments.length) return;
    if (this.tickerSegBadge) {
      this.tickerSegBadge.textContent = `§ ${segIdx + 1}`;
    }

    const segWords = this.words.filter((w) => w.seg === segIdx);
    this.tickerWordsMount.innerHTML = "";
    segWords.forEach((w) => {
      const span = document.createElement("span");
      span.className = "word";
      if (this.gendersEnabled && w.gender) {
        span.classList.add(`noun-${w.gender}`);
      }
      if (w.id === wordIdx) {
        span.classList.add("active");
      }
      span.textContent = w.w;
      this.tickerWordsMount.appendChild(span);
      this.tickerWordsMount.appendChild(document.createTextNode(" "));
    });
  }

  handleGlobalKeyDown(e) {
    if (!this.shortcutsEnabled) return;

    // Ignore if typing in input or textarea
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    // Ignore if modal is visible
    if ((this.urlModal && this.urlModal.style.display === "flex") ||
        (this.libraryModal && this.libraryModal.style.display === "flex") ||
        (this.renameModal && this.renameModal.style.display === "flex")) {
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      this.togglePlayPause();
    } else if (e.code === "KeyE") {
      e.preventDefault();
      this.toggleTranslation();
    } else if (e.code === "KeyR") {
      e.preventDefault();
      if (this.activeSegmentIndex !== -1) {
        this.clickParagraph(this.activeSegmentIndex);
      }
    } else if (e.code === "ArrowDown" || e.code === "KeyJ") {
      e.preventDefault();
      if (this.activeSegmentIndex < this.segments.length - 1) {
        this.clickParagraph(this.activeSegmentIndex + 1);
      }
    } else if (e.code === "ArrowUp" || e.code === "KeyK") {
      e.preventDefault();
      if (this.activeSegmentIndex > 0) {
        this.clickParagraph(this.activeSegmentIndex - 1);
      }
    } else if (e.code === "BracketRight") {
      e.preventDefault();
      this.cyclePlaybackSpeed();
    } else if (e.code === "KeyT") {
      e.preventDefault();
      this.toggleTickerMode();
    } else if (e.code === "KeyL") {
      e.preventDefault();
      this.toggleAbMode();
    } else if (e.code === "Escape") {
      if (this.expressionPopover && this.expressionPopover.style.display !== "none") {
        this.hideExpressionPopover();
      } else if (this.loopRange || this.abSelectionStep > 0) {
        e.preventDefault();
        this.clearLoopRange();
      }
    }
  }

  formatTime(sec) {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new MiniLinguaFloatApp();
});
