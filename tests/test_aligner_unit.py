import re
import unittest
from pathlib import Path


def extract_youtube_video_id(url: str) -> str:
    """Helper mimicking the regex in aligner.py"""
    match = re.search(r"(?:v=|\/|youtu\.be\/|embed\/)([0-9A-Za-z_-]{11})", url)
    return match.group(1) if match else ""


class TestAlignerUnit(unittest.TestCase):
    def test_youtube_url_variations(self):
        urls = {
            "https://www.youtube.com/watch?v=Yaelm87PTvg": "Yaelm87PTvg",
            "https://youtu.be/Yaelm87PTvg": "Yaelm87PTvg",
            "https://www.youtube.com/embed/Yaelm87PTvg": "Yaelm87PTvg",
            "https://www.youtube.com/watch?v=Yaelm87PTvg&t=45s": "Yaelm87PTvg",
            "https://m.youtube.com/watch?v=Yaelm87PTvg": "Yaelm87PTvg",
            "https://www.youtube.com/shorts/Yaelm87PTvg": "Yaelm87PTvg",
        }
        for url, expected_id in urls.items():
            vid = extract_youtube_video_id(url)
            self.assertEqual(vid, expected_id, f"Failed extracting from {url}")

    def test_invalid_youtube_urls(self):
        invalids = [
            "",
            "not_a_url",
            "https://google.com",
            "https://youtube.com/about",
            "https://youtube.com/watch?v=short",
        ]
        for url in invalids:
            vid = extract_youtube_video_id(url)
            self.assertNotEqual(len(vid), 11, f"Should not match 11-char ID from: {url}")

    def test_transcript_timestamp_monotonicity(self):
        """Verifies that words within each segment are sequentially ordered."""
        import json
        transcript_path = Path(__file__).resolve().parent.parent / "transcript.json"
        if not transcript_path.exists():
            return

        with open(transcript_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        words = data.get("words", [])
        for i in range(len(words) - 1):
            w1 = words[i]
            w2 = words[i + 1]
            # Next word start should not be significantly before previous word start
            self.assertLessEqual(w1["s"], w2["s"] + 0.05, f"Word {i} ({w1['w']}) out of order with {i+1} ({w2['w']})")


if __name__ == "__main__":
    unittest.main()
