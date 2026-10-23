import { useState, useEffect } from 'react';
import './theme.css';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { audioEngine } from './services/audioEngine';
import { projectService } from './services/projectService';
import { useProjectStore } from './stores/projectStore';
import { usePlayerStore } from './stores/playerStore';
import { Timeline } from './components/Timeline/Timeline';
import { Favorites } from './components/Dictation/Favorites';
import { Dictation } from './components/Dictation/Dictation';
import { Transport } from './components/Player/Transport';

export default function App() {
  const { project, setProject, setBlobUrl, setBlobUrls, recordingBlobs, addRecordingBlob } = useProjectStore();
  const { setDuration, setCurrentTime } = usePlayerStore();

  const [mode, setMode] = useState<'audio'|'dictation'|'favorites'>('audio');
  const [asrBusy,setAsrBusy] = useState(false);
  useEffect(()=>{if(!project)return;const key='aboboo-favorites:'+project.originalAudioPath+':'+project.duration.toFixed(2);if(project.favorites===undefined){try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(saved))useProjectStore.getState().updateProject({favorites:saved});}catch{}}},[project?.id]);
  useEffect(()=>{if(!project?.favorites)return;try{localStorage.setItem('aboboo-favorites:'+project.originalAudioPath+':'+project.duration.toFixed(2),JSON.stringify(project.favorites));}catch{}},[project?.favorites]);

  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const reportError = (error: unknown) => setError('操作失败：' + String(error));

  const handleOpenFile = async () => {
    const selected = await open({
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'aif', 'aiff', 'mp4'] }, { name: '所有文件', extensions: ['*'] }],
      multiple: false,
    });
    if (!selected || typeof selected !== 'string') return;

    setError('');
    setLoading('正在检查音频…');
    let url: string | null = null;
    try {
      await invoke('inspect_audio_file', { path: selected });
      setLoading('正在读取音频…');
      const bytes = await readFile(selected);
      const ext = selected.split('.').pop()?.toLowerCase() ?? '';
      const mime = ({mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', mp4:'audio/mp4', aac:'audio/aac', flac:'audio/flac', aif:'audio/aiff', aiff:'audio/aiff', ogg:'audio/ogg'} as Record<string, string>)[ext] || 'application/octet-stream';
      const blob = new Blob([bytes], { type: mime });
      url = URL.createObjectURL(blob);
      const arrayBuffer = await blob.arrayBuffer();

      const newProject = projectService.createProject(
        selected.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Project',
        selected,
        0,
      );

      setLoading('正在解码音频，较长录音可能需要一些时间…');
      let duration: number;
      try {
        duration = await audioEngine.loadAudio(newProject.tracks[0].id, arrayBuffer);
      } catch {
        throw new Error('无法解码此音频。文件可能损坏，或当前系统不支持它的编码；请转换为 MP3 / WAV 后重试。');
      }
      newProject.tracks[0].duration = duration;
      newProject.duration = duration;

      audioEngine.stop();
      useProjectStore.getState().clear();
      usePlayerStore.getState().setIsPlaying(false);
      setProject(newProject);
      setBlobUrl(newProject.tracks[0].id, url);
      addRecordingBlob(newProject.tracks[0].id, blob);
      url = null;
      setDuration(duration);
      setCurrentTime(0);
    } finally {
      if (url) URL.revokeObjectURL(url);
      setLoading('');
    }
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
    <div className="app-shell">
      {/* Toolbar */}
      <div className="app-toolbar">
        <span className="app-brand">Aboboo <small>社区版</small></span>
        <button onClick={() => handleOpenFile().catch(reportError)} disabled={asrBusy || !!loading || usePlayerStore.getState().isRecording} style={toolbarBtn}>打开音频</button>
        <button onClick={() => handleLoadProject().catch(reportError)} disabled={asrBusy || !!loading || usePlayerStore.getState().isRecording} style={toolbarBtn}>打开项目</button>
        <button onClick={() => handleSave().catch(reportError)} disabled={asrBusy || !!loading || !project || usePlayerStore.getState().isRecording} style={toolbarBtn}>保存项目</button>
        {project && <button style={toolbarBtn} disabled={asrBusy || usePlayerStore.getState().isRecording} onClick={()=>{audioEngine.stop();usePlayerStore.getState().setIsPlaying(false);setMode(mode==='dictation'?'audio':'dictation');}}>{mode==='dictation'?'音频／跟读':'听写练习'}</button>}
        {project && <button style={toolbarBtn} disabled={asrBusy || usePlayerStore.getState().isRecording} onClick={()=>{audioEngine.stop();usePlayerStore.getState().setIsPlaying(false);setMode('favorites');}}>收藏词卡 ({project.favorites?.length||0})</button>}
        {project && (
          <span style={{ marginLeft: 8, color: '#81a1cc', fontSize: 13 }}>{project.name}</span>
        )}
      </div>

      {loading && <div role="status" style={{padding:12, color:'#a9cfff'}}>{loading}</div>}
      {error && <div role="alert" style={{padding:12, color:'#ffb4ab'}} onClick={() => setError('')}>{error}（点击关闭）</div>}
      {/* Timeline */}
      {project ? (
        mode==='dictation'?<Dictation onBusy={setAsrBusy}/>:mode==='favorites'?<Favorites/>:<Timeline />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 16 }}>
          打开音频，开始播放与跟读录音 · 社区实验版
        </div>
      )}

      {/* Transport */}
      {mode==='audio'&&<Transport />}
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  padding: '5px 12px', background: '#132030', border: '1px solid #2e4666',
  borderRadius: 2, color: '#b1c7e5', cursor: 'pointer', fontSize: 13,
};
