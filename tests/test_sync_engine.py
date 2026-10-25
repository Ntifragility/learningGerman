import json
import unittest
from pathlib import Path


def find_word_at_time(words, t: float) -> int:
    """Exact replica of findWordAtTime binary search logic from app.js"""
    if not words:
        return -1

    low = 0
    high = len(words) - 1

    while low <= high:
        mid = (low + high) >> 1
        w = words[mid]
        if t < w["s"]:
            high = mid - 1
        elif t > w["e"]:
            low = mid + 1
        else:
            return mid

    # Near-match gap tolerance (0.25s pause between words)
    if 0 <= high < len(words):
        if words[high]["s"] <= t <= words[high]["e"] + 0.25:
            return high

    return -1


class TestSyncEngine(unittest.TestCase):
    def test_transcript_schema(self):
        transcript_path = Path(__file__).resolve().parent.parent / "transcript.json"
        self.assertTrue(transcript_path.exists(), "transcript.json must exist")
        
        with open(transcript_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        self.assertIn("meta", data)
        self.assertIn("segments", data)
        self.assertIn("words", data)
        self.assertGreater(len(data["words"]), 0)
        
        # Verify word timestamps are valid
        for w in data["words"]:
            self.assertIn("w", w)
            self.assertIn("s", w)
            self.assertIn("e", w)
            self.assertLessEqual(w["s"], w["e"], f"Start time {w['s']} must be <= end time {w['e']}")

    def test_binary_search_exact_and_mid_word(self):
        sample_words = [
            {"w": "Hallo", "s": 1.0, "e": 1.5, "seg": 0},
            {"w": "Welt", "s": 2.0, "e": 2.8, "seg": 0},
            {"w": "Deutsch", "s": 3.0, "e": 3.6, "seg": 1},
        ]
        # Exact start
        self.assertEqual(find_word_at_time(sample_words, 1.0), 0)
        # Mid word
        self.assertEqual(find_word_at_time(sample_words, 1.3), 0)
        # Exact end
        self.assertEqual(find_word_at_time(sample_words, 1.5), 0)

        # In pause within 0.25s gap tolerance (e.g. 1.6s after 1.5s end)
        self.assertEqual(find_word_at_time(sample_words, 1.6), 0)
        # In pause beyond 0.25s gap tolerance (1.8s) -> gap
        self.assertEqual(find_word_at_time(sample_words, 1.8), -1)

        # Word 1
        self.assertEqual(find_word_at_time(sample_words, 2.5), 1)
        # Word 2
        self.assertEqual(find_word_at_time(sample_words, 3.2), 2)

    def test_binary_search_edge_boundaries(self):
        sample_words = [
            {"w": "Hallo", "s": 1.0, "e": 1.5, "seg": 0},
            {"w": "Welt", "s": 2.0, "e": 2.5, "seg": 0},
        ]
        # Before any words
        self.assertEqual(find_word_at_time(sample_words, 0.0), -1)
        self.assertEqual(find_word_at_time(sample_words, 0.9), -1)

        # Far after last word
        self.assertEqual(find_word_at_time(sample_words, 10.0), -1)

        # Empty words list
        self.assertEqual(find_word_at_time([], 1.0), -1)


if __name__ == "__main__":
    unittest.main()
