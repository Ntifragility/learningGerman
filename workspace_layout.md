lingua_float/
├── .antigravity/
│   └── task_plan.md          # Step-by-step agentic execution tracker
├── .venv/                    # Isolated Python virtual environment
├── src/
│   ├── engine/
│   │   ├── __init__.py
│   │   └── aligner.py        # faster-whisper extraction logic
│   ├── ui/
│   │   ├── index.html        # Clean, minimal widget UI
│   │   ├── style.css         # Modern dark/light theme, custom scrollbar
│   │   └── app.js            # Binary search sync & audio bridge
│   └── main.py               # pywebview launcher & system metrics bridge
├── tests/
│   ├── test_aligner.py
│   └── test_sync_engine.py
├── requirements.txt
└── run.bat                   # 1-click desktop launch script
