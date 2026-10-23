import { writeFile, readTextFile, readFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { v4 as uuidv4 } from 'uuid';
import type { Project } from '../types/project';

export class ProjectService {
  async saveProject(project: Project, recordingBlobs: Map<string, Blob>): Promise<string | null> {
    const filePath = await save({
      filters: [{ name: 'Aboboo Project', extensions: ['abmac'] }],
      defaultPath: `${project.name}.abmac`,
    });
    if (!filePath) return null;

    const embeddedAudio: Record<string, { data: string; mime: string }> = {};
    for (const track of project.tracks) {
      const blob = recordingBlobs.get(track.id);
      const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : await readFile(track.audioPath);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      embeddedAudio[track.id] = { data: btoa(binary), mime: blob?.type || 'application/octet-stream' };
    }
    const updatedProject = {
      ...project, format: 'aboboo-community-v1', embeddedAudio,
      metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
    };

    const json = JSON.stringify(updatedProject, null, 2);
    const encoder = new TextEncoder();
    await writeFile(filePath, encoder.encode(json));
    return filePath;
  }

  async loadProject(): Promise<{ project: Project; blobUrls: Map<string, string>; recordingBlobs: Map<string, Blob> } | null> {
    const filePath = await open({
      filters: [{ name: 'Aboboo Project', extensions: ['abmac'] }],
      multiple: false,
    });
    if (!filePath || typeof filePath !== 'string') return null;

    const json = await readTextFile(filePath);
    const document = JSON.parse(json);
    if (document.format !== 'aboboo-community-v1' || !Array.isArray(document.tracks) || !document.embeddedAudio) {
      throw new Error('请选择本社区版保存的 .abmac 项目；不支持官方 Aboboo 课件。');
    }
    const project: Project = document;
    const blobUrls = new Map<string, string>();
    const recordingBlobs = new Map<string, Blob>();
    for (const track of project.tracks) {
      const entry = document.embeddedAudio[track.id];
      if (!entry || typeof entry.data !== 'string') throw new Error('项目音频缺失');
      const binary = atob(entry.data);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: entry.mime });
      blobUrls.set(track.id, URL.createObjectURL(blob));
      recordingBlobs.set(track.id, blob);
    }
    return { project, blobUrls, recordingBlobs };
  }

  createProject(name: string, originalAudioPath: string, duration: number): Project {
    const now = new Date().toISOString();
    const projectId = uuidv4();
    const trackId = uuidv4();
    return {
      id: projectId,
      name,
      originalAudioPath,
      duration,
      tracks: [
        {
          id: trackId,
          type: 'original',
          name: 'Original',
          audioPath: originalAudioPath,
          startTime: 0,
          duration,
          volume: 1,
          muted: false,
        },
      ],
      metadata: { createdAt: now, updatedAt: now },
    };
  }
}

export const projectService = new ProjectService();
