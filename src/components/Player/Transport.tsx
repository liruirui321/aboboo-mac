import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useProjectStore } from '../../stores/projectStore';
import { audioEngine } from '../../services/audioEngine';
import { useParallelRecording } from '../../hooks/useParallelRecording';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

export function Transport() {
  const { isPlaying, isRecording, currentTime, duration, setCurrentTime, setIsPlaying } = usePlayerStore();
  const { project } = useProjectStore();
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [rate, setRate] = useState(1);
  const loopingRef = useRef(false);
  useEffect(() => { setLoopA(null); setLoopB(null); setLoopEnabled(false); }, [project?.id]);
  const rafRef = useRef<number>(0);
  const { startRecording, stopRecording } = useParallelRecording();

  useEffect(() => {
    const tick = () => {
      if (audioEngine.isPlaying()) {
        const t = audioEngine.getCurrentTime();
        setCurrentTime(t);
        if (!isRecording && loopEnabled && loopA !== null && loopB !== null && t >= loopB && !loopingRef.current && project) {
          loopingRef.current = true;
          audioEngine.seek(loopA);
          setCurrentTime(loopA);
          void audioEngine.play(project.tracks).finally(() => { loopingRef.current = false; });
        } else if (duration > 0 && t >= duration) {
          if (isRecording) { void stopRecording(); return; }
          audioEngine.stop();
          setIsPlaying(false);
          setCurrentTime(0);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, isRecording, loopEnabled, loopA, loopB, project, stopRecording, setCurrentTime, setIsPlaying]);

  const handlePlayPause = async () => {
    if (!project) return;
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      const tracks = project.tracks.map(t => ({ id: t.id, startTime: t.startTime, volume: t.volume, muted: t.muted }));
      await audioEngine.setPlaybackRate(rate, tracks);
      await audioEngine.play(tracks);
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (isRecording) { void stopRecording(); return; }
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRecord = async () => {
    if (isRecording) {
      void stopRecording();
    } else {
      if (!project) return;
      setRate(1);
      await audioEngine.setPlaybackRate(1, project.tracks);
      await startRecording();
    }
  };

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || !project) return;
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName))) return;
      if (e.code === 'Space' && !isRecording) { e.preventDefault(); void handlePlayPause(); }
      if (e.key === 'Escape') { e.preventDefault(); handleStop(); }
      if (e.key === '[' && !isRecording) { setLoopA(currentTime); setLoopB(null); setLoopEnabled(false); }
      if (e.key === ']' && !isRecording && loopA !== null && currentTime > loopA + 0.1) { setLoopB(currentTime); setLoopEnabled(true); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ padding: '12px 16px', background: '#1e300e', borderTop: '1px solid #3d5523', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={handleStop} disabled={!project} style={btnStyle('#555')}>■</button>
      <button onClick={handlePlayPause} disabled={!project || isRecording} style={btnStyle(isPlaying ? '#e67e22' : '#97c637')}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button onClick={handleRecord} disabled={!project} style={btnStyle(isRecording ? '#c0392b' : '#e74c3c')}>
        {isRecording ? '■ 结束录音' : '● 跟读录音'}
      </button>
      <button onClick={stopRecording} disabled={!isRecording} style={btnStyle('#7f8c8d')}>■ 保存录音</button>
      <label style={{fontSize:12}}>速度 <select aria-label="播放速度" value={rate} disabled={isRecording || !project}
        title="当前使用音频采样变速，音调也会变化"
        onChange={e => { const next = Number(e.target.value); setRate(next); if (project) void audioEngine.setPlaybackRate(next, project.tracks); }}>
        {[0.5,0.75,1,1.25,1.5,2].map(v => <option key={v} value={v}>{v}×</option>)}
      </select></label>
      <button disabled={!project || isRecording} style={btnStyle('#304a17')} onClick={() => {setLoopA(currentTime); setLoopB(null); setLoopEnabled(false);}}>A {loopA === null ? '—' : formatTime(loopA)}</button>
      <button disabled={!project || isRecording || loopA === null || currentTime <= loopA + 0.1} style={btnStyle('#304a17')} onClick={() => {setLoopB(currentTime); setLoopEnabled(true);}}>B {loopB === null ? '—' : formatTime(loopB)}</button>
      <button disabled={isRecording || loopB === null} aria-pressed={loopEnabled} style={btnStyle(loopEnabled ? '#5d881a' : '#304a17')} onClick={() => setLoopEnabled(!loopEnabled)}>A–B 循环</button>
      <div style={{ flex: 1, minWidth:80, height: 4, background: '#3d5523', borderRadius: 2, cursor: 'pointer' }}
        onClick={e => {
          if (!project || isRecording) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const t = ratio * duration;
          const wasPlaying = audioEngine.seek(t);
          if (wasPlaying) void audioEngine.play(project.tracks);
          setCurrentTime(t);
        }}
      >
        <div style={{ width: `${progress}%`, height: '100%', background: '#97c637', borderRadius: 2 }} />
      </div>
      <span style={{ color: '#c9dda5', fontSize: 13, fontFamily: 'monospace', minWidth: 80 }}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 12px', background: bg, border: 'none', borderRadius: 4,
    color: '#fff', cursor: 'pointer', fontSize: 13,
  };
}
