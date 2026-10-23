#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASR_DIR="$ROOT_DIR/src-tauri/resources/asr"
mkdir -p "$ASR_DIR"
MODEL_SHA=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
if ! test -f "$ASR_DIR/model.bin"; then
  curl -fL --retry 3 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' -o "$ASR_DIR/model.bin.partial"
  printf '%s  %s\n' "$MODEL_SHA" "$ASR_DIR/model.bin.partial" | shasum -a 256 -c -
  mv "$ASR_DIR/model.bin.partial" "$ASR_DIR/model.bin"
fi
printf '%s  %s\n' "$MODEL_SHA" "$ASR_DIR/model.bin" | shasum -a 256 -c -
if ! test -x "$ASR_DIR/whisper-cli"; then
  BUILD_DIR="$(mktemp -d)"
  trap 'rm -rf "$BUILD_DIR"' EXIT
  git clone --depth 1 --branch v1.7.4 https://github.com/ggml-org/whisper.cpp.git "$BUILD_DIR/whisper"
  cmake -S "$BUILD_DIR/whisper" -B "$BUILD_DIR/build" -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DGGML_METAL_EMBED_LIBRARY=ON
  cmake --build "$BUILD_DIR/build" --config Release --target whisper-cli -j 3
  cp "$BUILD_DIR/build/bin/whisper-cli" "$ASR_DIR/whisper-cli"
  cp "$BUILD_DIR/whisper/LICENSE" "$ASR_DIR/LICENSE-whisper.txt"
fi
if ! test -f "$ASR_DIR/LICENSE-whisper.txt"; then
  curl -fL --retry 3 https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.7.4/LICENSE -o "$ASR_DIR/LICENSE-whisper.txt"
fi
if ! test -f "$ASR_DIR/LICENSE-model.txt"; then
  curl -fL --retry 3 https://raw.githubusercontent.com/openai/whisper/main/LICENSE -o "$ASR_DIR/LICENSE-model.txt"
fi
