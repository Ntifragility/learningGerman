                           +--------------------------+
                           | Audio Source (.mp3/.wav) |
                           +------------+-------------+
                                        |
                                        v
                    +---------------------------------------+
                    | Offline Preprocessing (faster-whisper) |
                    | - VAD Filtering                       |
                    | - Token/Word-level Timestamps         |
                    | - Quantized Int8 Inference            |
                    +-------------------+-------------------+
                                        |
                                        v
                            [ transcript_schema.json ]
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
  +------------------------------+             +-------------------------------+
  |      Backend Bridge          |             |       Frontend Shell          |
  |  (Python + pywebview API)    |             | (Compact HTML5/CSS3/ES6)      |
  | - Window positioning (corner)| <--- RPC ---| - Word DOM tokenization       |
  | - Windows Always-on-Top flag |             | - Binary search index lookup  |
  | - File dialogs / hotkeys     |             | - RAF / timeupdate rendering  |
  +------------------------------+             +-------------------------------+