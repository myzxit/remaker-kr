#!/usr/bin/env python3
"""faster-whisper 로 오디오를 받아 단어 타임스탬프까지 JSON 으로 내보낸다.

사용법:
    python3 worker/transcribe.py --input audio.wav --output transcript.json \
        --model small --device cpu --compute-type int8 --language ko

출력 형식:
    {"language": "ko", "duration": 1234.5,
     "segments": [{"start": 0.0, "end": 3.2, "text": "...",
                   "words": [{"start": 0.0, "end": 0.4, "word": "..."}]}]}
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="ko")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper 가 설치되어 있지 않습니다. "
            "pip install -r requirements.txt 를 먼저 실행하세요.",
            file=sys.stderr,
        )
        return 2

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    segments, info = model.transcribe(
        args.input,
        language=args.language or None,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        beam_size=5,
    )

    out_segments = []
    for seg in segments:
        words = []
        for w in seg.words or []:
            token = (w.word or "").strip()
            if not token:
                continue
            words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": token})
        text = (seg.text or "").strip()
        if not text:
            continue
        out_segments.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": text,
                "words": words,
            }
        )
        # 긴 영상에서 진행 상황이 보이도록 stderr 로 흘려준다.
        print(f"progress {seg.end:.1f}", file=sys.stderr, flush=True)

    payload = {
        "language": info.language,
        "duration": round(info.duration, 3),
        "segments": out_segments,
    }

    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
