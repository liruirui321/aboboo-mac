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

  async exportWav(id: string): Promise<Uint8Array> {
    const original = this.buffers.get(id);
    if (!original) throw new Error('请先打开音频。');
    if (original.duration > 7200) throw new Error('单次识别暂限两小时音频。');
    const offline = new OfflineAudioContext(1, Math.ceil(original.duration * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = original; source.connect(offline.destination); source.start();
    const data = (await offline.startRendering()).getChannelData(0);
    const bytes = new Uint8Array(44 + data.length * 2); const view = new DataView(bytes.buffer);
    const tag = (offset:number,text:string) => [...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,data.length*2,true);
    for(let i=0;i<data.length;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,data[i]))*(data[i]<0?32768:32767)),true);
    return bytes;
  }

  async playRange(id:string,start:number,end:number,rate=1) {
    const buffer=this.buffers.get(id);if(!buffer)throw new Error('音频尚未加载。');
    this.stop();const ctx=this.getCtx();await ctx.resume();
    start=Math.max(0,start);end=Math.min(buffer.duration,end);if(end<=start)return;
    this.rate=rate;this.pausedAt=start;this.startedAt=ctx.currentTime;this.playing=true;
    const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(ctx.destination);
    this.sources.set(id,source);
    source.onended=()=>{if(this.sources.get(id)===source && this.playing){this.pausedAt=end;this.playing=false;this.sources.delete(id);source.disconnect();}};
    source.start(0,start,end-start);
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
