import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { audioEngine } from './services/audioEngine';
import { projectService } from './services/projectService';
import { useProjectStore } from './stores/projectStore';
import { usePlayerStore } from './stores/playerStore';
import { Timeline } from './components/Timeline/Timeline';
import { Transport } from './components/Player/Transport';

export default function App() {
  const { project, setProject, setBlobUrl, setBlobUrls, recordingBlobs, addRecordingBlob } = useProjectStore();
  const { setDuration, setCurrentTime } = usePlayerStore();

  const [error, setError] = useState('');
  const reportError = (error: unknown) => setError('操作失败：' + String(error));

  const handleOpenFile = async () => {
    const selected = await open({
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
      multiple: false,
    });
    if (!selected || typeof selected !== 'string') return;

    const bytes = await readFile(selected);
    const ext = selected.split('.').pop() ?? 'mp3';
    const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/ogg';
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const arrayBuffer = await blob.arrayBuffer();

    const newProject = projectService.createProject(
      selected.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Project',
      selected,
      0,
    );

    const duration = await audioEngine.loadAudio(newProject.tracks[0].id, arrayBuffer);
    newProject.tracks[0].duration = duration;
    newProject.duration = duration;

    audioEngine.stop();
    useProjectStore.getState().clear();
    usePlayerStore.getState().setIsPlaying(false);
    setProject(newProject);
    setBlobUrl(newProject.tracks[0].id, url);
    setDuration(duration);
    setCurrentTime(0);
  };

  const handleSave = async () => {
    if (!project) return;
    await projectService.saveProject(project, recordingBlobs);
  };

  const handleLoadProject = async () => {
    const result = await projectService.loadProject();
    if (!result) return;
    const { project: loaded, blobUrls } = result;

    audioEngine.stop();
    useProjectStore.getState().clear();
    usePlayerStore.getState().setIsPlaying(false);
    for (const [id, blob] of result.recordingBlobs) addRecordingBlob(id, blob);
    for (const track of loaded.tracks) {
      const url = blobUrls.get(track.id);
      if (url) {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        await audioEngine.loadAudio(track.id, ab);
      }
    }

    setProject(loaded);
    setBlobUrls(blobUrls);
    setDuration(loaded.duration);
    setCurrentTime(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f1a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#16213e', borderBottom: '1px solid #333' }}>
        <span style={{ fontWeight: 600, fontSize: 16, marginRight: 8 }}>Aboboo 社区版</span>
        <button onClick={() => handleOpenFile().catch(reportError)} disabled={usePlayerStore.getState().isRecording} style={toolbarBtn}>打开音频</button>
        <button onClick={() => handleLoadProject().catch(reportError)} disabled={usePlayerStore.getState().isRecording} style={toolbarBtn}>打开项目</button>
        <button onClick={() => handleSave().catch(reportError)} disabled={!project || usePlayerStore.getState().isRecording} style={toolbarBtn}>保存项目</button>
        {project && (
          <span style={{ marginLeft: 8, color: '#888', fontSize: 13 }}>{project.name}</span>
        )}
      </div>

      {error && <div role="alert" style={{padding:12, color:'#ffb4ab'}} onClick={() => setError('')}>{error}（点击关闭）</div>}
      {/* Timeline */}
      {project ? (
        <Timeline />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 16 }}>
          打开音频，开始播放与跟读录音 · 社区实验版
        </div>
      )}

      {/* Transport */}
      <Transport />
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  padding: '5px 12px', background: '#2c3e50', border: '1px solid #444',
  borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 13,
};
