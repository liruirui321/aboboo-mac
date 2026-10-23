export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingStartTime = 0;

  async initialize(): Promise<void> {
    if (this.stream) return; // reuse existing stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Microphone access denied: ${msg}`);
    }
  }

  startRecording(currentTime: number): void {
    if (!this.stream) throw new Error('Recorder not initialized');
    this.chunks = [];
    this.recordingStartTime = currentTime;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = e => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100);
  }

  pauseRecording(): void {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resumeRecording(): void {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  stopRecording(): Promise<{ blob: Blob; startTime: number }> {
    return new Promise(resolve => {
      if (!this.recorder) {
        resolve({ blob: new Blob(), startTime: 0 });
        return;
      }
      const mimeType = this.recorder.mimeType || 'audio/webm';
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        resolve({ blob, startTime: this.recordingStartTime });
      };
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      else resolve({ blob: new Blob(this.chunks, { type: mimeType }), startTime: this.recordingStartTime });
    });
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  isPaused(): boolean {
    return this.recorder?.state === 'paused';
  }

  dispose() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

export const audioRecorder = new AudioRecorder();
