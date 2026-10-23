export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sources: Map<string, AudioBufferSourceNode> = new Map();
  private buffers: Map<string, AudioBuffer> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private startedAt = 0;
  private pausedAt = 0;
  private playing = false;
  private rate = 1;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  async loadAudio(id: string, arrayBuffer: ArrayBuffer): Promise<number> {
    const ctx = this.getCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.buffers.set(id, audioBuffer);
    return audioBuffer.duration;
  }

  async play(tracks: Array<{ id: string; startTime: number; volume: number; muted: boolean }>) {
    if (this.playing) return;
    const ctx = this.getCtx();
    await ctx.resume();
    const offset = this.pausedAt;

    for (const track of tracks) {
      const buffer = this.buffers.get(track.id);
      if (!buffer || offset >= track.startTime + buffer.duration) continue;

      const gain = ctx.createGain();
      gain.gain.value = track.muted ? 0 : track.volume;
      gain.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.rate;
      source.connect(gain);

      const trackOffset = Math.max(0, offset - track.startTime);
      const when = ctx.currentTime + Math.max(0, track.startTime - offset) / this.rate;
      source.start(when, trackOffset);

      this.sources.set(track.id, source);
      this.gainNodes.set(track.id, gain);
    }

    this.startedAt = ctx.currentTime;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.getCurrentTime();
    this.playing = false;
    this.sources.forEach(s => { try { s.stop(0); } catch {} });
    this.sources.forEach(s => s.disconnect());
    this.gainNodes.forEach(g => g.disconnect());
    this.sources.clear();
    this.gainNodes.clear();
  }

  stop() {
    this.pause();
    this.pausedAt = 0;
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.pausedAt = time;
    return wasPlaying;
  }

  getCurrentTime(): number {
    if (!this.ctx) return 0;
    if (!this.playing) return this.pausedAt;
    return this.pausedAt + (this.ctx.currentTime - this.startedAt) * this.rate;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async setPlaybackRate(rate: number, tracks: Array<{ id: string; startTime: number; volume: number; muted: boolean }>) {
    const resume = this.playing;
    if (resume) this.pause();
    this.rate = Math.max(0.5, Math.min(2, rate));
    if (resume) await this.play(tracks);
  }

  setVolume(id: string, volume: number, muted: boolean) {
    const gain = this.gainNodes.get(id);
    if (gain) gain.gain.value = muted ? 0 : volume;
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
  }
}

export const audioEngine = new AudioEngine();
