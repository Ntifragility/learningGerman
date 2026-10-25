import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.engine.aligner import TranscriptAligner, download_youtube_audio

__all__ = ["TranscriptAligner", "download_youtube_audio"]
