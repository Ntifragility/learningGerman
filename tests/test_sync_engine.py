import json
import unittest
from pathlib import Path

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

if __name__ == "__main__":
    unittest.main()
