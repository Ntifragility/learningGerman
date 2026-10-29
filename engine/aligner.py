import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"
for p in (ROOT_DIR, SRC_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from src.engine.aligner import TranscriptAligner, download_youtube_audio, get_youtube_transcript_or_audio

__all__ = ["TranscriptAligner", "download_youtube_audio", "get_youtube_transcript_or_audio"]
