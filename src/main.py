import os
import sys
import json
import socket
import shutil
import re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse
import urllib.request

# Path Setup
FILE_PATH = Path(__file__).resolve()
SRC_DIR = FILE_PATH.parent
ROOT_DIR = SRC_DIR.parent
UI_DIR = SRC_DIR / "ui"
DOWNLOADS_DIR = ROOT_DIR / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

for p in (ROOT_DIR, SRC_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from src.engine.aligner import TranscriptAligner, download_youtube_audio, get_youtube_transcript_or_audio
except ImportError:
    from engine.aligner import TranscriptAligner, download_youtube_audio, get_youtube_transcript_or_audio

TRANSLATION_CACHE = {}


def translate_text(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return ""
    if cleaned in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[cleaned]

    # Primary translation: Google Translate single API (with retry)
    for attempt in range(2):
        try:
            q = urllib.parse.quote(cleaned)
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&q={q}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as res:
                data = json.loads(res.read().decode("utf-8"))
                parts = [part[0] for part in data[0] if part and part[0]]
                translated = "".join(parts).strip()
                if translated and translated.lower() != cleaned.lower():
                    TRANSLATION_CACHE[cleaned] = translated
                    return translated
        except Exception as e:
            if attempt == 1:
                print(f"[Translation] Google gtx error for '{cleaned[:25]}...': {e}")

    # Fallback translation: MyMemory API
    for attempt in range(2):
        try:
            q = urllib.parse.quote(cleaned)
            url = f"https://api.mymemory.translated.net/get?q={q}&langpair=de|en"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as res:
                data = json.loads(res.read().decode("utf-8"))
                matches = data.get("responseData", {}).get("translatedText", "")
                if matches and matches.strip() and matches.lower() != cleaned.lower():
                    TRANSLATION_CACHE[cleaned] = matches.strip()
                    return matches.strip()
        except Exception as e:
            if attempt == 1:
                print(f"[Translation] MyMemory fallback error: {e}")

    return cleaned


class LinguaFloatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if self.path == "/api/list-downloads":
            items = []
            for json_file in sorted(DOWNLOADS_DIR.glob("*_transcript.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    stem = json_file.stem.replace("_transcript", "")
                    audio_file = None
                    for ext in [".m4a", ".mp3", ".wav", ".mp4", ".ogg"]:
                        cand = DOWNLOADS_DIR / f"{stem}{ext}"
                        if cand.exists():
                            audio_file = cand
                            break
                    with open(json_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    meta = data.get("meta", {})
                    items.append({
                        "id": stem,
                        "title": meta.get("title") or stem,
                        "duration_sec": meta.get("duration_sec", 0),
                        "words": meta.get("word_count", 0),
                        "audio_url": f"/downloads/{audio_file.name}" if audio_file else None,
                        "json_url": f"/downloads/{json_file.name}"
                    })
                except Exception:
                    continue
            self.send_json_response({"items": items})
            return

        if self.path.startswith("/downloads/"):
            rel_path = urllib.parse.unquote(self.path[len("/downloads/"):])
            file_path = DOWNLOADS_DIR / rel_path
            if file_path.exists() and file_path.is_file():
                self.send_response(200)
                if file_path.suffix in [".m4a", ".mp4"]:
                    self.send_header("Content-Type", "audio/mp4")
                elif file_path.suffix in [".mp3"]:
                    self.send_header("Content-Type", "audio/mpeg")
                elif file_path.suffix in [".wav"]:
                    self.send_header("Content-Type", "audio/wav")
                else:
                    self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(file_path.stat().st_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                with open(file_path, "rb") as f:
                    self.copyfile(f, self.wfile)
                return

        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/process-youtube":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            yt_url = data.get("url")

            if not yt_url:
                self.send_json_response({"error": "Missing 'url' parameter"}, status=400)
                return

            try:
                print(f"[LinguaFloat] Processing YouTube: {yt_url}")
                result = get_youtube_transcript_or_audio(yt_url, DOWNLOADS_DIR)
                self.send_json_response(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response({"error": str(e)}, status=500)
            return

        elif self.path == "/api/transcribe-local":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"error": "No audio data provided"}, status=400)
                return

            raw_filename = self.headers.get("X-Filename", "audio.mp3")
            safe_filename = urllib.parse.unquote(raw_filename).replace(" ", "_")
            safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in "._-")
            if not safe_filename:
                safe_filename = "local_audio.mp3"

            audio_dest = DOWNLOADS_DIR / safe_filename
            stem = audio_dest.stem
            json_dest = DOWNLOADS_DIR / f"{stem}_transcript.json"

            try:
                print(f"[LinguaFloat] Receiving & transcribing local audio: {safe_filename} ({content_length} bytes)")
                with open(audio_dest, "wb") as f:
                    remaining = content_length
                    chunk_size = 64 * 1024
                    while remaining > 0:
                        chunk = self.rfile.read(min(remaining, chunk_size))
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)

                aligner = TranscriptAligner(model_size="base", device="cpu", compute_type="int8")
                transcript = aligner.process_audio(audio_dest, output_json=json_dest, language="de")

                self.send_json_response({
                    "success": True,
                    "title": safe_filename,
                    "audio_url": f"/downloads/{safe_filename}",
                    "transcript": transcript
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response({"error": str(e)}, status=500)
            return

        elif self.path == "/api/rename-download":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"error": "Missing request body"}, status=400)
                return

            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception:
                self.send_json_response({"error": "Invalid JSON body"}, status=400)
                return

            old_id = data.get("old_id", "").strip()
            new_name = data.get("new_name", "").strip()

            if not old_id or not new_name:
                self.send_json_response({"error": "Both 'old_id' and 'new_name' are required"}, status=400)
                return

            # Sanitize new_name: strip illegal characters
            clean_name = re.sub(r'[\\/*?:"<>|]', "", new_name).strip()
            if not clean_name:
                self.send_json_response({"error": "Filename contains invalid characters"}, status=400)
                return

            old_stem = old_id.replace("_transcript", "")
            new_stem = clean_name.replace("_transcript", "")

            # Locate old transcript file
            old_json = DOWNLOADS_DIR / f"{old_stem}_transcript.json"
            if not old_json.exists():
                old_json = DOWNLOADS_DIR / f"{old_id}.json"

            if not old_json.exists():
                self.send_json_response({"error": f"Transcript for '{old_id}' not found"}, status=404)
                return

            # Find matching audio file
            old_audio = None
            for ext in [".m4a", ".mp3", ".wav", ".mp4", ".ogg", ".flac", ".aac"]:
                cand = DOWNLOADS_DIR / f"{old_stem}{ext}"
                if cand.exists():
                    old_audio = cand
                    break

            new_json = DOWNLOADS_DIR / f"{new_stem}_transcript.json"
            new_audio = (DOWNLOADS_DIR / f"{new_stem}{old_audio.suffix}") if old_audio else None

            # Collision check if stem changed
            if new_stem != old_stem:
                if new_json.exists():
                    self.send_json_response({"error": f"A lesson named '{new_stem}' already exists"}, status=409)
                    return
                if new_audio and new_audio.exists():
                    self.send_json_response({"error": f"Audio file '{new_audio.name}' already exists"}, status=409)
                    return

            try:
                # 1. Rename audio file if exists
                if old_audio and old_audio.exists() and new_audio and old_audio != new_audio:
                    old_audio.rename(new_audio)

                # 2. Update JSON contents and write to new_json
                with open(old_json, "r", encoding="utf-8") as f:
                    transcript_data = json.load(f)

                meta = transcript_data.setdefault("meta", {})
                meta["title"] = clean_name
                if new_audio:
                    meta["audio_file"] = new_audio.name

                with open(new_json, "w", encoding="utf-8") as f:
                    json.dump(transcript_data, f, ensure_ascii=False, indent=2)

                if old_json != new_json and old_json.exists():
                    old_json.unlink()

                print(f"[LinguaFloat] Renamed '{old_stem}' -> '{new_stem}' (audio: {new_audio.name if new_audio else 'None'})")

                self.send_json_response({
                    "success": True,
                    "old_id": old_stem,
                    "new_id": new_stem,
                    "new_title": clean_name,
                    "audio_url": f"/downloads/{new_audio.name}" if new_audio else None,
                    "json_url": f"/downloads/{new_json.name}"
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response({"error": str(e)}, status=500)
            return

        elif self.path == "/api/load-local-path":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"error": "Missing request body"}, status=400)
                return

            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception:
                self.send_json_response({"error": "Invalid JSON body"}, status=400)
                return

            paths = data.get("paths", [])
            if isinstance(paths, str):
                paths = [paths]

            if not paths:
                self.send_json_response({"error": "No paths provided"}, status=400)
                return

            selected_files = [Path(p) for p in paths if Path(p).exists()]
            if not selected_files:
                self.send_json_response({"error": "Selected files do not exist on disk"}, status=404)
                return

            json_file = next((f for f in selected_files if f.suffix == ".json"), None)
            audio_file = next((f for f in selected_files if f.suffix.lower() in [".mp3", ".m4a", ".wav", ".ogg", ".mp4", ".flac", ".aac"]), None)

            # Copy to DOWNLOADS_DIR if outside
            if audio_file:
                target_audio = DOWNLOADS_DIR / audio_file.name
                if audio_file.resolve() != target_audio.resolve():
                    shutil.copy2(audio_file, target_audio)
                audio_file = target_audio

            if json_file:
                target_json = DOWNLOADS_DIR / json_file.name
                if json_file.resolve() != target_json.resolve():
                    shutil.copy2(json_file, target_json)
                json_file = target_json

            # Companion pairing if audio selected without explicit json
            if audio_file and not json_file:
                stem = audio_file.stem
                cand_json = DOWNLOADS_DIR / f"{stem}_transcript.json"
                if cand_json.exists():
                    json_file = cand_json

            if json_file and json_file.exists():
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        tdata = json.load(f)
                    meta = tdata.get("meta", {})
                    if not audio_file:
                        audio_name = meta.get("audio_file")
                        if audio_name and (DOWNLOADS_DIR / audio_name).exists():
                            audio_file = DOWNLOADS_DIR / audio_name
                    self.send_json_response({
                        "success": True,
                        "title": meta.get("title") or (audio_file.stem if audio_file else json_file.stem),
                        "audio_url": f"/downloads/{audio_file.name}" if audio_file else None,
                        "transcript": tdata
                    })
                    return
                except Exception as e:
                    self.send_json_response({"error": f"Failed reading transcript: {e}"}, status=500)
                    return

            if audio_file:
                self.send_json_response({
                    "success": True,
                    "needs_transcription": True,
                    "filename": audio_file.name,
                    "audio_url": f"/downloads/{audio_file.name}",
                    "title": audio_file.stem
                })
                return

            self.send_json_response({"error": "No valid audio or transcript found"}, status=400)
            return

        elif self.path == "/api/transcribe-existing":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception:
                self.send_json_response({"error": "Invalid JSON body"}, status=400)
                return

            filename = data.get("filename")
            if not filename:
                self.send_json_response({"error": "Missing filename"}, status=400)
                return

            audio_path = DOWNLOADS_DIR / filename
            if not audio_path.exists():
                self.send_json_response({"error": f"File '{filename}' not found in downloads"}, status=404)
                return

            stem = audio_path.stem
            json_dest = DOWNLOADS_DIR / f"{stem}_transcript.json"

            try:
                aligner = TranscriptAligner(model_size="base", device="cpu", compute_type="int8")
                transcript = aligner.process_audio(audio_path, output_json=json_dest, language="de")
                self.send_json_response({
                    "success": True,
                    "title": stem,
                    "audio_url": f"/downloads/{filename}",
                    "transcript": transcript
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response({"error": str(e)}, status=500)
            return

        elif self.path == "/api/translate":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"error": "Missing request body"}, status=400)
                return

            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception:
                self.send_json_response({"error": "Invalid JSON body"}, status=400)
                return

            text = data.get("text")
            texts = data.get("texts")
            lesson_id = data.get("lesson_id")

            if text is None and not texts:
                self.send_json_response({"error": "Must provide 'text' or 'texts' to translate"}, status=400)
                return

            try:
                if text is not None:
                    translated = translate_text(str(text))
                    self.send_json_response({"success": True, "original": text, "translated": translated})
                    return

                if texts:
                    import concurrent.futures
                    # Translate in parallel up to 6 workers for ultra fast batch response
                    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                        translations = list(executor.map(translate_text, texts))

                    # If lesson_id provided, persist translations directly to the transcript file
                    if lesson_id:
                        stem = lesson_id.replace("_transcript", "")
                        cand_json = DOWNLOADS_DIR / f"{stem}_transcript.json"
                        if not cand_json.exists():
                            cand_json = DOWNLOADS_DIR / f"{stem}.json"

                        if cand_json.exists():
                            try:
                                with open(cand_json, "r", encoding="utf-8") as f:
                                    tdata = json.load(f)
                                segs = tdata.get("segments", [])
                                for idx, tr in enumerate(translations):
                                    if idx < len(segs):
                                        segs[idx]["translation"] = tr
                                with open(cand_json, "w", encoding="utf-8") as f:
                                    json.dump(tdata, f, ensure_ascii=False, indent=2)
                                print(f"[LinguaFloat] Persisted {len(translations)} translations into {cand_json.name}")
                            except Exception as fe:
                                print(f"[LinguaFloat] Note: Could not cache translations to file: {fe}")

                    self.send_json_response({
                        "success": True,
                        "count": len(translations),
                        "translations": translations
                    })
                    return
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response({"error": str(e)}, status=500)
                return

        self.send_response(404)
        self.end_headers()

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def log_message(self, format, *args):
        try:
            req = str(args[0]) if len(args) > 0 else ""
            status = str(args[1]) if len(args) > 1 else ""
            if "/api/" in req or status not in ("200", "204", "304"):
                super().log_message(format, *args)
        except Exception:
            pass


def find_free_port(start_port=8080, max_attempts=50):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port


def run_server(preferred_port=8080):
    port = find_free_port(preferred_port)
    server = ThreadingHTTPServer(("127.0.0.1", port), LinguaFloatHandler)
    url = f"http://127.0.0.1:{port}/index.html"
    return server, url, port


def main():
    server, url, port = run_server(8080)

    # Launch background HTTP server
    import threading
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    # Launch native desktop floating window in bottom-left corner
    try:
        import webview

        screens = webview.screens
        screen = screens[0] if screens else None
        screen_w = screen.width if screen else 1536
        screen_h = screen.height if screen else 960

        # Exact 1/20th screen scale (approx 340px x 270px)
        win_w = 340
        win_h = 270

        # Position in bottom-left corner (above Windows taskbar)
        win_x = 16
        win_y = max(20, screen_h - win_h - 60)

        print("\n" + "=" * 60)
        print("  🚀 LinguaFloat - German Floating Corner Widget")
        print("=" * 60)
        print(f"  * Size: {win_w}x{win_h} (1/20th screen corner widget)")
        print(f"  * Position: Left corner ({win_x}, {win_y})")
        print(f"  * Always On Top: True")
        print("=" * 60 + "\n")

        class DesktopBridge:
            def __init__(self, downloads_dir):
                self.window = None
                self.downloads_dir = str(downloads_dir)

            def set_window(self, win):
                self.window = win

            def resize_window(self, width, height):
                try:
                    if self.window:
                        self.window.resize(int(width), int(height))
                    return True
                except Exception:
                    return False

            def open_file_dialog(self):
                try:
                    import webview
                    if self.window:
                        res = self.window.create_file_dialog(
                            webview.OPEN_DIALOG,
                            directory=self.downloads_dir,
                            allow_multiple=True,
                            file_types=('Audio & Transcripts (*.mp3;*.m4a;*.wav;*.json)', 'All files (*.*)')
                        )
                        return list(res) if res else []
                    return []
                except Exception as e:
                    print(f"[DesktopBridge] File dialog error: {e}")
                    return []

        bridge = DesktopBridge(DOWNLOADS_DIR)

        window = webview.create_window(
            title="LinguaFloat DE",
            url=url,
            width=win_w,
            height=win_h,
            x=win_x,
            y=win_y,
            on_top=True,      # Floating Always on Top!
            resizable=True,
            frameless=False,
            easy_drag=True,
            js_api=bridge
        )
        bridge.set_window(window)
        webview.start()

    except Exception as e:
        import webbrowser
        print(f"[LinguaFloat] Desktop window fallback ({e}). Opening in browser...")
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down LinguaFloat.")


if __name__ == "__main__":
    main()
