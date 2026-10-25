import json
import os
import re
from pathlib import Path
from typing import Dict, Any, Optional

class TranscriptAligner:
    """
    Offline speech-to-text and word-level timestamp alignment engine
    optimized for German audio and podcasts using faster-whisper.
    """
    def __init__(self, model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    @property
    def model(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
        return self._model

    def process_audio(
        self,
        audio_path: str | Path,
        output_json: Optional[str | Path] = None,
        language: str = "de"
    ) -> Dict[str, Any]:
        audio_path = Path(audio_path).resolve()
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        segments_gen, info = self.model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        data = {
            "meta": {
                "audio_file": audio_path.name,
                "duration_sec": round(info.duration, 2),
                "language": info.language or language,
                "word_count": 0,
                "segment_count": 0
            },
            "segments": [],
            "words": []
        }

        seg_idx = 0
        global_word_idx = 0
        for seg in segments_gen:
            clean_seg_text = seg.text.strip()
            if not clean_seg_text:
                continue

            seg_words = []
            if seg.words:
                for w in seg.words:
                    word_str = w.word.strip()
                    if word_str:
                        word_obj = {
                            "id": global_word_idx,
                            "w": word_str,
                            "s": round(w.start, 3),
                            "e": round(w.end, 3),
                            "seg": seg_idx
                        }
                        data["words"].append(word_obj)
                        seg_words.append(global_word_idx)
                        global_word_idx += 1

            data["segments"].append({
                "id": seg_idx,
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": clean_seg_text,
                "word_ids": seg_words
            })
            seg_idx += 1

        data["meta"]["word_count"] = len(data["words"])
        data["meta"]["segment_count"] = len(data["segments"])

        if output_json:
            output_json = Path(output_json)
            output_json.parent.mkdir(parents=True, exist_ok=True)
            with open(output_json, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return data


def download_youtube_audio(url: str, output_dir: str | Path) -> Dict[str, Any]:
    import yt_dlp

    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(out_dir / "%(id)s.%(ext)s")

    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'outtmpl': out_template,
        'noplaylist': True,
        'quiet': False,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        
        actual_path = Path(filename)
        if not actual_path.exists():
            video_id = info.get('id', '')
            matches = list(out_dir.glob(f"{video_id}.*"))
            if matches:
                actual_path = matches[0]

        return {
            "title": info.get("title", "YouTube Audio"),
            "duration": info.get("duration", 0),
            "audio_path": str(actual_path),
            "id": info.get("id"),
            "uploader": info.get("uploader", "")
        }


def get_youtube_transcript_or_audio(url: str, output_dir: str | Path) -> Dict[str, Any]:
    """
    Fast processing: extracts video ID and attempts to download audio stream
    and transcribe with Whisper for word-level timestamps.
    """
    import yt_dlp

    # Extract Video ID
    video_id = ""
    match = re.search(r"(?:v=|\/|youtu\.be\/|embed\/)([0-9A-Za-z_-]{11})", url)
    if match:
        video_id = match.group(1)

    dl_result = download_youtube_audio(url, output_dir)
    audio_path = Path(dl_result["audio_path"])
    vid_id = dl_result.get("id") or video_id

    # Whisper transcription
    aligner = TranscriptAligner(model_size="base", device="cpu", compute_type="int8")
    json_path = Path(output_dir) / f"{audio_path.stem}_transcript.json"
    transcript = aligner.process_audio(audio_path, output_json=json_path, language="de")

    return {
        "success": True,
        "title": dl_result.get("title"),
        "video_id": vid_id,
        "audio_url": f"/downloads/{audio_path.name}",
        "transcript": transcript
    }
