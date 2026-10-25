"""
LinguaFloat - Root Launcher
Allows running directly from VS Code PLAY button with main.py open.
"""
import sys
from pathlib import Path

# Ensure root and src are in sys.path
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"

for p in (ROOT_DIR, SRC_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from src.main import main

if __name__ == "__main__":
    main()
