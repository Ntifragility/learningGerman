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

    // Modal elements
    this.btnOpenUrlModal = document.getElementById("btn-open-url-modal");
    this.urlModal = document.getElementById("url-modal");
    this.ytUrlInput = document.getElementById("yt-url-input");
    this.btnSubmitUrl = document.getElementById("btn-submit-url");
    this.btnCloseModal = document.getElementById("btn-close-modal");
    this.localFileInput = document.getElementById("local-file-input");

    this.wordDOMElements = [];
    this.parrafoDOMElements = [];

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

    // Auto-scroll toggle
    this.btnToggleScroll.addEventListener("click", () => {
      this.autoScrollEnabled = !this.autoScrollEnabled;
      this.btnToggleScroll.classList.toggle("active", this.autoScrollEnabled);
      this.statusHint.textContent = this.autoScrollEnabled ? "Auto-scroll ON" : "Auto-scroll OFF";
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
    const tick = () => {
      let currentTime = this.getCurrentPlaybackTime();
      let totalDuration = this.getTotalDuration();

      if (this.isPlaying) {
        this.syncStep(currentTime);
      }

      this.updateProgressUI(currentTime, totalDuration);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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

  setActiveSegment(segIdx) {
    if (segIdx === this.activeSegmentIndex) return;

    if (this.activeSegmentIndex !== -1 && this.parrafoDOMElements[this.activeSegmentIndex]) {
      this.parrafoDOMElements[this.activeSegmentIndex].classList.remove("active-parrafo");
    }

    if (segIdx !== -1 && this.parrafoDOMElements[segIdx]) {
      const parrafoEl = this.parrafoDOMElements[segIdx];
      parrafoEl.classList.add("active-parrafo");

      // Smooth auto-scroll to keep active paragraph centered
      if (this.autoScrollEnabled) {
        parrafoEl.scrollIntoView({ behavior: "smooth", block: "center" });
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

    const targetStart = this.segments[segIdx].start;

    // 1. Immediately STOP the current section
    this.stopCurrentPlayback();

    // 2. Clear old word highlight
    if (this.activeWordIndex !== -1 && this.wordDOMElements[this.activeWordIndex]) {
      this.wordDOMElements[this.activeWordIndex].classList.remove("active");
    }
    this.activeWordIndex = -1;

    // 3. Highlight this paragraph immediately
    this.setActiveSegment(segIdx);

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

    this.statusHint.textContent = `Replaying § ${segIdx + 1} (${this.formatTime(targetStart)})`;
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

      // Clicking ANYWHERE on the paragraph stops current section & starts reproducing it
      parrafoEl.addEventListener("click", () => {
        this.clickParagraph(sIdx);
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

      // Clicking any word restarts both text and audio from the beginning of the paragraph
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        this.clickParagraph(w.seg);
      });

      const parentParrafo = this.parrafoDOMElements[w.seg];
      if (parentParrafo) {
        const textCont = parentParrafo.querySelector(".parrafo-text");
        textCont.appendChild(span);
        textCont.appendChild(document.createTextNode(" "));
      }

      this.wordDOMElements.push(span);
    });

    // Reset state to first paragraph
    this.activeWordIndex = -1;
    this.activeSegmentIndex = -1;
    if (this.segments.length > 0) {
      this.setActiveSegment(0);
    }
  }

  async processYouTubeUrl() {
    const url = this.ytUrlInput.value.trim();
    if (!url) return;

    this.urlModal.style.display = "none";
    this.statusHint.textContent = "Processing YouTube & German Transcript...";

    try {
      const res = await fetch("/api/process-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });

      if (!res.ok) throw new Error("Processing failed");
      const data = await res.json();

      if (data.transcript) {
        this.headerTitle.textContent = data.title || "YouTube Audio";
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
    } catch (err) {
      console.warn("API error:", err);
      this.statusHint.textContent = "Backend offline. Check main.py console.";
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

  handleLocalFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          this.renderTranscript(parsed);
          this.statusHint.textContent = `Loaded: ${file.name}`;
        } catch (err) {
          this.statusHint.textContent = "Invalid JSON file";
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("audio/")) {
      this.activePlayerType = "audio";
      this.audio.src = URL.createObjectURL(file);
      this.audio.load();
      this.headerTitle.textContent = file.name;
      this.statusHint.textContent = "Audio loaded • Click paragraph";
    }
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
