// A local two-tone ringtone; no microphone or downloaded audio is needed.
class CallRingtone {
  constructor(onBlocked) {
    this.onBlocked = onBlocked;
    this.context = null;
    this.output = null;
    this.ringing = false;
    this.timer = null;
    this.voices = new Set();
    this.unlock = this.unlock.bind(this);
    document.addEventListener('pointerdown', this.unlock, { passive: true });
    document.addEventListener('keydown', this.unlock);
    window.addEventListener('pagehide', () => this.stop());
  }

  async unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio playback unavailable');
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0;
        this.output.connect(this.context.destination);
      }
      if (this.context.state !== 'running') {
        this.onBlocked(this.ringing);
        await this.context.resume();
      }
      if (this.context.state !== 'running') throw new Error('A tap is needed for sound');
      document.removeEventListener('pointerdown', this.unlock);
      document.removeEventListener('keydown', this.unlock);
      if (this.ringing) this.play();
      this.onBlocked(false);
      return true;
    } catch (error) {
      this.onBlocked(this.ringing);
      return false;
    }
  }

  start() {
    this.ringing = true;
    return this.unlock();
  }

  play() {
    this.stopSound();
    const pulse = () => {
      if (!this.ringing || this.context.state !== 'running') {
        this.stopSound();
        this.onBlocked(this.ringing);
        return;
      }
      const now = this.context.currentTime;
      const gain = this.output.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(0.1, now + 0.03);
      gain.setValueAtTime(0.1, now + 0.9);
      gain.linearRampToValueAtTime(0, now + 1);
      [440, 480].forEach(frequency => {
        const voice = this.context.createOscillator();
        voice.frequency.value = frequency;
        voice.connect(this.output);
        this.voices.add(voice);
        voice.onended = () => { voice.disconnect(); this.voices.delete(voice); };
        voice.start(now);
        voice.stop(now + 1.02);
      });
    };
    pulse();
    this.timer = setInterval(pulse, 3000);
  }

  stopSound() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.voices.forEach(voice => { try { voice.stop(); } catch (error) {} voice.disconnect(); });
    this.voices.clear();
    if (this.output) {
      this.output.gain.cancelScheduledValues(this.context.currentTime);
      this.output.gain.setValueAtTime(0, this.context.currentTime);
    }
  }

  stop() {
    this.ringing = false;
    this.stopSound();
    this.onBlocked(false);
  }
}
