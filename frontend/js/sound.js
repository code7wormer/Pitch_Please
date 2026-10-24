// Retro Arcade Synthesizer using Web Audio API
class ArcadeSound {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(freq, type = 'square', duration = 0.08, volume = 0.1) {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            // Audio not allowed yet
        }
    }

    click() {
        this.playTone(600, 'square', 0.04, 0.05);
    }

    wheelTick() {
        this.playTone(850, 'triangle', 0.03, 0.08);
    }

    countdownTick() {
        this.playTone(440, 'square', 0.08, 0.12);
    }

    countdownFinal() {
        this.playTone(880, 'square', 0.2, 0.18);
    }

    voteSuccess() {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.07);
                gain.gain.setValueAtTime(0.12, now + i * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.07);
                osc.stop(now + i * 0.07 + 0.2);
            });
        } catch (e) {}
    }

    winnerFanfare() {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const notes = [440, 554.37, 659.25, 880];
            const now = this.ctx.currentTime;
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + idx * 0.1);
                gain.gain.setValueAtTime(0.1, now + idx * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.1);
                osc.stop(now + idx * 0.1 + 0.3);
            });
        } catch (e) {}
    }

    errorBuzz() {
        this.playTone(150, 'sawtooth', 0.25, 0.15);
    }
}

window.arcadeSound = new ArcadeSound();
