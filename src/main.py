import os
import sys
import json
import socket
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse

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


class LinguaFloatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
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
            super().log_message(format, *args)


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
            easy_drag=True
        )
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
