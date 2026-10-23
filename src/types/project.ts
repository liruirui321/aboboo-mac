export interface ProjectMetadata {
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  type: 'original' | 'recording';
  name: string;
  audioPath: string;
  startTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  recordingStart?: number;
}

export interface Project {
  id: string;
  name: string;
  originalAudioPath: string;
  duration: number;
  tracks: Track[];
  metadata: ProjectMetadata;
}
