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

    def test_transcribe_local_missing_data(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/transcribe-local",
            data=b"",
            headers={"X-Filename": "test.mp3"},
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
        except TypeError:
            self.fail("log_message raised TypeError on HTTPStatus object")
    def test_rename_download_missing_params(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/rename-download",
            data=json.dumps({"old_id": ""}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 400)
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

    def test_rename_download_success_and_cleanup(self):
        # Create temporary dummy audio and transcript in DOWNLOADS_DIR
        test_stem = "_test_lesson_rename"
        dummy_audio = DOWNLOADS_DIR / f"{test_stem}.mp3"
        dummy_json = DOWNLOADS_DIR / f"{test_stem}_transcript.json"

        dummy_audio.write_bytes(b"ID3dummy")
        dummy_json.write_text(json.dumps({
            "meta": {"title": test_stem, "audio_file": f"{test_stem}.mp3"},
            "segments": [],
            "words": []
        }), encoding="utf-8")

        new_name = "_test_lesson_renamed_ok"
        renamed_audio = DOWNLOADS_DIR / f"{new_name}.mp3"
        renamed_json = DOWNLOADS_DIR / f"{new_name}_transcript.json"

        try:
            req = urllib.request.Request(
                f"{self.base_url}/api/rename-download",
                data=json.dumps({"old_id": test_stem, "new_name": new_name}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 200)
                res_data = json.loads(response.read().decode("utf-8"))
                self.assertTrue(res_data.get("success"))
                self.assertEqual(res_data.get("new_id"), new_name)
                self.assertEqual(res_data.get("new_title"), new_name)

            self.assertTrue(renamed_audio.exists(), "Renamed audio file should exist on disk")
            self.assertTrue(renamed_json.exists(), "Renamed JSON transcript should exist on disk")
            self.assertFalse(dummy_audio.exists(), "Old audio file should be removed")
            self.assertFalse(dummy_json.exists(), "Old JSON file should be removed")

            # Check JSON metadata
            with open(renamed_json, "r", encoding="utf-8") as f:
                saved = json.load(f)
            self.assertEqual(saved["meta"]["title"], new_name)
            self.assertEqual(saved["meta"]["audio_file"], f"{new_name}.mp3")

        finally:
            for p in (dummy_audio, dummy_json, renamed_audio, renamed_json):
                if p.exists():
                    p.unlink()

    def test_load_local_path_endpoint(self):
        sample_audio = DOWNLOADS_DIR / "vMKl23O6z9k.m4a"
        if sample_audio.exists():
            req = urllib.request.Request(
                f"{self.base_url}/api/load-local-path",
                data=json.dumps({"paths": [str(sample_audio)]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 200)
                res_data = json.loads(response.read().decode("utf-8"))
                self.assertTrue(res_data.get("success"))
                self.assertIn("vMKl23O6z9k", res_data.get("audio_url", ""))
                self.assertIn("transcript", res_data)

    def test_translate_single_text(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/translate",
            data=json.dumps({"text": "Guten Morgen, mein Freund"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertTrue(data.get("success"))
            self.assertIn("morning", data.get("translated", "").lower())

    def test_translate_batch_texts(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/translate",
            data=json.dumps({"texts": ["Hallo Welt", "Auf Wiedersehen"]}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertTrue(data.get("success"))
            translations = data.get("translations", [])
            self.assertEqual(len(translations), 2)
            self.assertIn("world", translations[0].lower())

    def test_translate_missing_params(self):
        req = urllib.request.Request(
            f"{self.base_url}/api/translate",
            data=json.dumps({}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 400)
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)


if __name__ == "__main__":
    unittest.main()

