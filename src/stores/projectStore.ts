import { create } from 'zustand';
import type { Project, Track } from '../types/project';
import { v4 as uuidv4 } from 'uuid';

interface ProjectState {
  project: Project | null;
  recordingBlobs: Map<string, Blob>;
  blobUrls: Map<string, string>;
  setProject: (project: Project) => void;
  addTrack: (track: Omit<Track, 'id'>) => Track;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  addRecordingBlob: (trackId: string, blob: Blob) => void;
  setBlobUrl: (trackId: string, url: string) => void;
  setBlobUrls: (urls: Map<string, string>) => void;
  clear: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  recordingBlobs: new Map(),
  blobUrls: new Map(),

  setProject: (project) => set({ project }),

  addTrack: (trackData) => {
    const track: Track = { ...trackData, id: uuidv4() };
    set(state => ({
      project: state.project
        ? { ...state.project, tracks: [...state.project.tracks, track] }
        : null,
    }));
    return track;
  },

  updateTrack: (id, updates) => {
    set(state => ({
      project: state.project
        ? {
            ...state.project,
            tracks: state.project.tracks.map(t => t.id === id ? { ...t, ...updates } : t),
          }
        : null,
    }));
  },

  removeTrack: (id) => {
    set(state => ({
      project: state.project
        ? { ...state.project, tracks: state.project.tracks.filter(t => t.id !== id) }
        : null,
    }));
  },

  addRecordingBlob: (trackId, blob) => {
    set(state => {
      const next = new Map(state.recordingBlobs);
      next.set(trackId, blob);
      return { recordingBlobs: next };
    });
  },

  setBlobUrl: (trackId, url) => {
    set(state => {
      const next = new Map(state.blobUrls);
      next.set(trackId, url);
      return { blobUrls: next };
    });
  },

  setBlobUrls: (urls) => set({ blobUrls: urls }),

  clear: () => set({ project: null, recordingBlobs: new Map(), blobUrls: new Map() }),
}));
