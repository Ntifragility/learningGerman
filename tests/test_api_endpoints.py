import json
import threading
import time
import unittest
import urllib.request
import urllib.error
from http import HTTPStatus
from pathlib import Path
from http.server import ThreadingHTTPServer

import sys
ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"
for p in (ROOT_DIR, SRC_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from src.main import LinguaFloatHandler, find_free_port, DOWNLOADS_DIR


class TestLinguaFloatServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = find_free_port(start_port=8900)
        cls.server = ThreadingHTTPServer(("127.0.0.1", cls.port), LinguaFloatHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_favicon_returns_204(self):
        req = urllib.request.Request(f"{self.base_url}/favicon.ico")
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.read(), b"")

    def test_list_downloads_endpoint(self):
        req = urllib.request.Request(f"{self.base_url}/api/list-downloads")
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("items", data)
            self.assertIsInstance(data["items"], list)
            if len(data["items"]) > 0:
                first = data["items"][0]
                self.assertIn("id", first)
                self.assertIn("title", first)
                self.assertIn("duration_sec", first)
                self.assertIn("json_url", first)

    def test_process_youtube_missing_url(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/process-youtube",
            data=json.dumps({}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 400)
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
            err_data = json.loads(e.read().decode("utf-8"))
            self.assertIn("error", err_data)

    def test_static_ui_serving(self):
        req = urllib.request.Request(f"{self.base_url}/index.html")
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode("utf-8")
            self.assertIn("LinguaFloat", content)
            self.assertIn("transcript-container", content)

    def test_log_message_handles_http_status_object_safely(self):
        # Verify log_message does not throw TypeError on HTTPStatus objects
        handler = LinguaFloatHandler.__new__(LinguaFloatHandler)
        handler.client_address = ("127.0.0.1", 12345)
        try:
            handler.log_message("code %d, message %s", HTTPStatus.NOT_FOUND, "File not found")
        except Exception as e:
            self.fail(f"log_message raised exception on HTTPStatus: {e}")


if __name__ == "__main__":
    unittest.main()
