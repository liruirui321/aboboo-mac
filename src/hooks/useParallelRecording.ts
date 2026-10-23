import { useRef, useCallback } from 'react';
import { audioEngine } from '../services/audioEngine';
import { audioRecorder } from '../services/recorder';
import { usePlayerStore } from '../stores/playerStore';
import { useProjectStore } from '../stores/projectStore';

export function useParallelRecording() {
  const lastRecordingStart = useRef(0);
  const { setIsRecording, setIsPlaying, setCurrentTime, currentTime } = usePlayerStore();
  const { project, addTrack, addRecordingBlob, setBlobUrl } = useProjectStore();

  const startRecording = useCallback(async () => {
    if (!project) return;
    try {
      await audioRecorder.initialize();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Microphone access failed');
      return;
    }

    const tracks = project.tracks.map(t => ({
      id: t.id,
      startTime: t.startTime,
      volume: t.volume,
      muted: t.muted,
    }));

    lastRecordingStart.current = currentTime;
    await audioEngine.play(tracks);
    audioRecorder.startRecording(currentTime);
    setIsPlaying(true);
    setIsRecording(true);
  }, [project, currentTime, setIsPlaying, setIsRecording]);

  const pauseRecording = useCallback(() => {
    audioEngine.pause();
    audioRecorder.pauseRecording();
    setIsPlaying(false);
    setIsRecording(false);
    setCurrentTime(lastRecordingStart.current);
    audioEngine.seek(lastRecordingStart.current);
  }, [setIsPlaying, setIsRecording, setCurrentTime]);

  const stopRecording = useCallback(async () => {
    audioEngine.stop();
    setIsPlaying(false);
    setIsRecording(false);

    const { blob, startTime } = await audioRecorder.stopRecording();
    audioRecorder.dispose();
    const url = URL.createObjectURL(blob);

    const track = addTrack({
      type: 'recording',
      name: `Recording ${new Date().toLocaleTimeString()}`,
      audioPath: '',
      startTime,
      duration: 0,
      volume: 1,
      muted: false,
      recordingStart: startTime,
    });

    addRecordingBlob(track.id, blob);
    setBlobUrl(track.id, url);

    const ab = await blob.arrayBuffer();
    const duration = await audioEngine.loadAudio(track.id, ab);
    const { updateTrack } = useProjectStore.getState();
    updateTrack(track.id, { duration });

    setCurrentTime(lastRecordingStart.current);
    audioEngine.seek(lastRecordingStart.current);
  }, [addTrack, addRecordingBlob, setBlobUrl, setIsPlaying, setIsRecording, setCurrentTime]);

  return { startRecording, pauseRecording, stopRecording };
}
