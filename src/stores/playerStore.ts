import { create } from 'zustand';

interface PlayerState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isRecording: boolean;
  playbackRate: number;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setIsPlaying: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  setPlaybackRate: (r: number) => void;
}

export const usePlayerStore = create<PlayerState>(set => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isRecording: false,
  playbackRate: 1,
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setIsRecording: (v) => set({ isRecording: v }),
  setPlaybackRate: (r) => set({ playbackRate: r }),
}));
