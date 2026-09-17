#!/usr/bin/env python3
"""파일에서 떠낸 목소리로 대본을 읽는다 (음성 복제).

XTTS-v2 는 참고 음성 몇 초만으로 그 목소리를 흉내 낸다. 모델을 올리는 데 시간이
오래 걸리므로, 문장마다 부르지 않고 한 번에 전부 처리한다.

사용법:
    python3 worker/clone_tts.py \
        --sentences sentences.json --speaker sample.wav \
        --language ko --outdir out --out result.json

출력(result.json):
    {"files": [{"index": 0, "path": "out/000.wav", "seconds": 1.83}, ...]}

주의: XTTS-v2 모델 가중치는 Coqui Public Model License(비상업) 입니다.
상업적으로 쓰려면 OpenVoice V2(MIT) + MeloTTS(MIT) 같은 조합으로 바꿔야 합니다.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import wave


def wav_seconds(path: str) -> float:
    with contextlib.closing(wave.open(path, "r")) as fh:
        return fh.getnframes() / float(fh.getframerate())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sentences", required=True, help="문장 배열이 담긴 JSON")
    parser.add_argument("--speaker", required=True, help="참고 음성 wav")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--outdir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="tts_models/multilingual/multi-dataset/xtts_v2")
    args = parser.parse_args()

    try:
        from TTS.api import TTS
    except ImportError:
        print(
            "음성 복제 엔진이 설치되어 있지 않습니다.\n"
            "  pip install coqui-tts\n"
            "를 실행한 뒤 다시 시도하세요.",
            file=sys.stderr,
        )
        return 2

    if not os.path.exists(args.speaker):
        print(f"참고 음성을 찾을 수 없습니다: {args.speaker}", file=sys.stderr)
        return 3

    with open(args.sentences, encoding="utf-8") as fh:
        sentences = json.load(fh)
    if not sentences:
        print("읽을 문장이 없습니다.", file=sys.stderr)
        return 4

    os.makedirs(args.outdir, exist_ok=True)

    # 모델을 올리는 데 CPU 에서 수십 초 걸린다. 한 번만 올린다.
    print("loading", file=sys.stderr, flush=True)
    tts = TTS(args.model)

    results = []
    for i, sentence in enumerate(sentences):
        text = str(sentence).strip()
        if not text:
            continue

        path = os.path.join(args.outdir, f"{i:03d}.wav")
        tts.tts_to_file(
            text=text,
            speaker_wav=args.speaker,
            language=args.language,
            file_path=path,
            # 문장은 이미 우리가 나눠 넘긴다. 엔진이 또 쪼개면 타이밍이 어긋난다.
            enable_text_splitting=False,
            # 같은 말을 반복하며 늘어지는 현상을 줄인다.
            repetition_penalty=5.0,
            temperature=0.7,
        )
        results.append({"index": i, "path": path, "seconds": round(wav_seconds(path), 3)})
        # 진행률을 워커가 읽어 화면에 보여준다.
        print(f"progress {i + 1}/{len(sentences)}", file=sys.stderr, flush=True)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"files": results}, fh, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
