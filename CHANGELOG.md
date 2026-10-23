# Changelog

## 0.3.0 — 2026-10-23

- Bundle offline Whisper transcription with silence splitting, progress and cancellation.
- Add sentence dictation, looping, hints, word-level grading, correction and SRT import/export.
- Rework dictation into a classic green dual-waveform workspace with sentence table and word sidebar.
- Restore the displayed playback rate when returning from dictation to the audio player.
- Add sentence/word favorites and audio flashcards with notes, review counts and mastery filtering.
- Persist dictation and cards in local cache and self-contained projects.
- Extend browser coverage for dictation, favorites and saved review state.


## 0.2.1 — 2026-10-23

- Detect macOS cloud placeholders before attempting audio reads.
- Show import stages and actionable decode errors.
- Expand file picker filters and handle uppercase extensions.
- Retain imported audio bytes for saving, avoiding a second dependency on the source file.
- Add regression coverage for cloud placeholder errors followed by successful import.

## 0.2.0 — 2026-10-23

- Add A–B repeat, 0.5–2× playback and Space / Esc / [ / ] shortcuts.
- Keep playback position consistent when changing speed.
- Reset to 1× when recording to preserve track alignment.
- Extend smoke tests to cover looping, half-speed and keyboard playback.
- Playback rate currently changes pitch; pitch-preserving playback is not implemented.

## 0.1.1 — 2026-10-23

- Build an Apple Silicon macOS application from the MIT community prototype.
- Use a distinct community bundle identifier and `.abmac` project format.
- Embed original audio and recordings in project files for reopening.
- Fix playback seeking, muted track updates, recording stop behavior and waveform lifecycle errors.
- Add Chinese controls and visible error messages.
- Add browser smoke tests with mocked file IPC and synthetic microphone input.

Known limits: no official Aboboo courseware or account support; real microphone validation remains pending.
