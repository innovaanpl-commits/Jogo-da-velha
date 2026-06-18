// Sound Effects manager using the Web Audio API for synthetic audio generated on-the-fly.
let audioCtx: AudioContext | null = null;
let isMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

// Ensure the context is running (unlocks iOS/Chrome restrictive policies)
async function resumeContext(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
      return true;
    } catch (e) {
      console.warn("Could not resume audio context:", e);
      return false;
    }
  }
  return true;
}

export const sounds = {
  toggleMute(): boolean {
    isMuted = !isMuted;
    return isMuted;
  },

  getIsMuted(): boolean {
    return isMuted;
  },

  playMove(symbol: "X" | "O" = "X") {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    
    resumeContext(ctx).then(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);

      // X plays a energetic high tech beep, O plays a slightly softer tone
      const startFreq = symbol === "X" ? 587.33 : 493.88; // D5 vs B4
      const endFreq = symbol === "X" ? 880.00 : 659.25; // A5 vs E5
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }).catch(err => console.debug("Audio play blocked", err));
  },

  playWin() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    resumeContext(ctx).then(() => {
      const now = ctx.currentTime;
      // Celebratory major arpeggio chime sequence: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        
        gain.gain.setValueAtTime(0.0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
        
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.45);
      });
    }).catch(err => console.debug("Audio play blocked", err));
  },

  playDraw() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    resumeContext(ctx).then(() => {
      const now = ctx.currentTime;
      // Neutral sliding synth tone (downward, slightly moody but soft)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sawtooth"; // soft/warm sawtooth filtering alternative
      osc.frequency.setValueAtTime(293.66, now); // D4
      osc.frequency.linearRampToValueAtTime(220.00, now + 0.25); // A3
      
      // Simple low pass filter to make sawtooth warm and clean
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(500, now);
      
      osc.disconnect(gain);
      osc.connect(filter);
      filter.connect(gain);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc.start(now);
      osc.stop(now + 0.4);
    }).catch(err => console.debug("Audio play blocked", err));
  }
};
