import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface WaveformProps {
  url: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onReady: (duration: number) => void;
  color?: string;
}

export function Waveform({ url, currentTime, duration, onSeek, onReady, color = '#4a9eff' }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const seekingRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: color.replace('ff', '88'),
      height: 60,
      normalize: true,
      interact: true,
    });
    let disposed = false;
    ws.load(url).catch(error => { if (!disposed) console.error('无法读取波形', error); });
    ws.on('ready', () => onReady(ws.getDuration()));
    ws.on('interaction', (t) => {
      seekingRef.current = true;
      onSeek(t);
    });
    wsRef.current = ws;
    return () => { disposed = true; ws.destroy(); wsRef.current = null; };
  }, [url]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || seekingRef.current) { seekingRef.current = false; return; }
    if (duration > 0 && Number.isFinite(currentTime) && Number.isFinite(ws.getDuration()) && ws.getDuration() > 0) ws.setTime(Math.max(0, Math.min(ws.getDuration(), currentTime)));
  }, [currentTime, duration]);

  return <div ref={containerRef} style={{ width: '100%' }} />;
}
