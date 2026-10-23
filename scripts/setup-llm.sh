#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LLM_DIR="$ROOT_DIR/src-tauri/resources/llm"
mkdir -p "$LLM_DIR"
MODEL_SHA=ca59ca7f13d0e15a8cfa77bd17e65d24f6844b554a7b6c12e07a5f89ff76844e
if ! test -f "$LLM_DIR/qwen.gguf"; then
 curl -fL --retry 3 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf' -o "$LLM_DIR/qwen.gguf.partial"
 printf '%s  %s\n' "$MODEL_SHA" "$LLM_DIR/qwen.gguf.partial" | shasum -a 256 -c -
 mv "$LLM_DIR/qwen.gguf.partial" "$LLM_DIR/qwen.gguf"
fi
printf '%s  %s\n' "$MODEL_SHA" "$LLM_DIR/qwen.gguf" | shasum -a 256 -c -
if ! test -f "$LLM_DIR/llama-completion"; then
 test "$(uname -m)" = arm64 || { echo 'This LLM bundle targets Apple Silicon.'; exit 1; }
 TEMP_DIR="$(mktemp -d)"; trap 'rm -rf "$TEMP_DIR"' EXIT
 curl -fL --retry 3 'https://github.com/ggml-org/llama.cpp/releases/download/b11829/llama-b11829-bin-macos-arm64.tar.gz' -o "$TEMP_DIR/llama.tar.gz"
 printf '%s  %s\n' e006ea32abe757c10a93718d246796b9bb7eafd309398927ff7b69139e4ba27e "$TEMP_DIR/llama.tar.gz" | shasum -a 256 -c -
 tar -xzf "$TEMP_DIR/llama.tar.gz" -C "$TEMP_DIR"
 cp -L "$TEMP_DIR/llama-b11829/"lib*.dylib "$LLM_DIR/"
 cp "$TEMP_DIR/llama-b11829/llama-completion" "$LLM_DIR/"
 cp "$TEMP_DIR/llama-b11829/LICENSE" "$LLM_DIR/LICENSE-llama.txt"
fi
if ! test -f "$LLM_DIR/LICENSE-model.txt"; then
 curl -fL --retry 3 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/raw/main/LICENSE' -o "$LLM_DIR/LICENSE-model.txt"
fi
