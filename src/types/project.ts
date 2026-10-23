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
  libraryId?: string;
  dictationBackups?: Array<{sentences:Sentence[];index:number;source:string}>;
  favorites?: Favorite[];
  dictation?: { sentences: Sentence[]; index: number; source: string; words?: Array<{start:number;end:number;text:string}>; segmentationVersion?:number };
}

export interface Sentence { id:string; start:number; end:number; text:string; answer:string; submitted:boolean; revealed:boolean; attempts:number; }

export interface Favorite { id:string; kind:"word"|"sentence"; text:string; context:string; start:number; end:number; note:string; mastered:boolean; reviews:number; }
