# Antigravity Task Plan: LinguaFloat

- [ ] **Phase 1: Environment & Toolchain Setup**
  - Verify Python 3.10+ in `.venv`.
  - Install dependencies: `faster-whisper`, `pywebview`, `pytest`.
  - Validate Windows WebView2 runtime availability.

- [ ] **Phase 2: TDD Test Harness**
  - Implement `tests/test_sync_engine.py` with mock timestamp data.
  - Implement `tests/test_aligner.py` contract checks.
  - Run `pytest` to confirm tests fail (RED).

- [ ] **Phase 3: Core Alignment Engine**
  - Implement `src/engine/aligner.py` using `faster-whisper` (`base` model, int8).
  - Implement export routine generating normalized `transcript.json`.
  - Run `pytest` to verify pipeline passes (GREEN).

- [ ] **Phase 4: Frontend UI & Event Engine**
  - Build `src/ui/index.html` and `src/ui/style.css` (custom dark mode, compact viewport).
  - Implement `src/ui/app.js` with $O(\log N)$ binary search word tracker and click-to-seek dispatcher.

- [ ] **Phase 5: Desktop Shell & Windows Screen Positioning**
  - Build `src/main.py` integrating `pywebview`.
  - Add native Windows API call to calculate right-bottom screen margin above the taskbar.
  - Set `on_top=True`.

- [ ] **Phase 6: Integration & Verification**
  - Run end-to-end test with a sample audio file.
  - Verify smooth scrolling, highlighting latency, and click-to-seek stability.