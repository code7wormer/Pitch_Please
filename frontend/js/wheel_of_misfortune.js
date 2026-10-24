/**
 * WHEEL OF MISFORTUNE — Standalone General Purpose Spin Wheel
 * Accepts any list of string items. Fully independent from the pitch wheel.
 */
class WheelOfMisfortune {
    constructor(canvasId, onSelected) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.onSelected = onSelected;
        this.items = [];
        this.rotation = 0;
        this.angularVelocity = 0;
        this.friction = 0.985;
        this.isSpinning = false;
        this.lastTickSegment = -1;
        this.animFrameId = null;

        // DOOM PALETTE — dark reds, purples, oranges, blood colors
        this.colors = [
            '#8B0000', '#4B0082', '#B22222', '#800080',
            '#CC2200', '#6600AA', '#FF4500', '#7B0D1E',
            '#9B1B30', '#551A8B', '#D2042D', '#3D0066',
            '#A91B0D', '#6B0AC9', '#FF2400', '#5C0033',
        ];

        // Dark text colors for contrast on dark backgrounds
        this.textColors = [
            '#FF6666', '#CC88FF', '#FF9988', '#DD99FF',
            '#FF8800', '#BB77FF', '#FFAA44', '#FF6688',
            '#FFAAAA', '#AA88FF', '#FFCC88', '#CC88EE',
            '#FF8866', '#9988FF', '#FF6644', '#FF99AA',
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const parent = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const size = Math.min(parent ? parent.clientWidth - 32 : 400, 480);
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.displayWidth = size;
        this.displayHeight = size;
        this.draw();
    }

    setItems(items) {
        this.items = items.filter(s => s && s.trim());
        this.rotation = 0;
        this.isSpinning = false;
        this.angularVelocity = 0;
        this.lastTickSegment = -1;
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        const w = this.displayWidth || 400;
        const h = this.displayHeight || 400;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 20;

        this.ctx.clearRect(0, 0, w, h);

        if (!this.items || this.items.length === 0) {
            this._drawEmptyWheel(cx, cy, radius);
            return;
        }

        const count = this.items.length;
        const arc = (Math.PI * 2) / count;

        // Draw outer shadow/glow ring
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
        const glowGrad = this.ctx.createRadialGradient(cx, cy, radius - 4, cx, cy, radius + 12);
        glowGrad.addColorStop(0, 'rgba(180, 0, 0, 0.6)');
        glowGrad.addColorStop(1, 'rgba(80, 0, 80, 0)');
        this.ctx.fillStyle = glowGrad;
        this.ctx.fill();
        this.ctx.restore();

        // Draw segments
        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate(this.rotation);

        for (let i = 0; i < count; i++) {
            const angle = i * arc;
            const baseColor = this.colors[i % this.colors.length];

            // Segment fill with gradient
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, radius, angle, angle + arc);
            this.ctx.closePath();

            const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            grad.addColorStop(0, this._lighten(baseColor, 30));
            grad.addColorStop(0.5, baseColor);
            grad.addColorStop(1, this._darken(baseColor, 40));
            this.ctx.fillStyle = grad;
            this.ctx.fill();

            // Segment border
            this.ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            this.ctx.lineWidth = 2.5;
            this.ctx.stroke();

            // Flame/decoration line at edge
            this.ctx.save();
            this.ctx.rotate(angle);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(radius, 0);
            this.ctx.strokeStyle = 'rgba(255, 60, 0, 0.4)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            this.ctx.restore();

            // Text
            this.ctx.save();
            this.ctx.rotate(angle + arc / 2);
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = '#fff';
            this.ctx.shadowColor = '#000';
            this.ctx.shadowBlur = 6;

            const maxLen = count > 10 ? 8 : count > 6 ? 11 : 14;
            let label = this.items[i];
            if (label.length > maxLen) label = label.substring(0, maxLen - 2) + '..';

            const fontSize = count > 12 ? 10 : count > 8 ? 12 : 13;
            this.ctx.font = `bold ${fontSize}px "Chakra Petch", monospace`;
            this.ctx.fillText(label, radius - 18, 5);
            this.ctx.restore();
        }

        // Center skull hub
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 36, 0, Math.PI * 2);
        const hubGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 36);
        hubGrad.addColorStop(0, '#2a0020');
        hubGrad.addColorStop(1, '#0a0008');
        this.ctx.fillStyle = hubGrad;
        this.ctx.fill();
        this.ctx.strokeStyle = '#8B0000';
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = '#8B0000';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();

        // Skull emoji in hub
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '22px serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('💀', 0, 0);

        this.ctx.restore();

        // Outer rim
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#8B0000';
        this.ctx.lineWidth = 5;
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 18;
        this.ctx.stroke();
        this.ctx.restore();

        // Top pointer (blood red triangle)
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - radius + 18);
        this.ctx.lineTo(cx - 18, cy - radius - 16);
        this.ctx.lineTo(cx + 18, cy - radius - 16);
        this.ctx.closePath();
        const ptGrad = this.ctx.createLinearGradient(cx, cy - radius - 16, cx, cy - radius + 18);
        ptGrad.addColorStop(0, '#FF4500');
        ptGrad.addColorStop(1, '#8B0000');
        this.ctx.fillStyle = ptGrad;
        this.ctx.shadowColor = '#FF4500';
        this.ctx.shadowBlur = 16;
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
        this.ctx.restore();
    }

    _drawEmptyWheel(cx, cy, radius) {
        // Spooky empty state
        this.ctx.save();

        // Pulsing dark ring
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        const bg = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        bg.addColorStop(0, '#1a0010');
        bg.addColorStop(0.7, '#0d0008');
        bg.addColorStop(1, '#000');
        this.ctx.fillStyle = bg;
        this.ctx.fill();
        this.ctx.strokeStyle = '#8B0000';
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 14;
        this.ctx.stroke();

        // Empty message
        this.ctx.fillStyle = '#8B0000';
        this.ctx.font = '10px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 8;
        this.ctx.fillText('ADD ITEMS', cx, cy - 14);
        this.ctx.fillText('TO SPIN', cx, cy + 8);

        // Skull
        this.ctx.font = '28px serif';
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText('💀', cx, cy + 42);

        // Pointer
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - radius + 18);
        this.ctx.lineTo(cx - 18, cy - radius - 16);
        this.ctx.lineTo(cx + 18, cy - radius - 16);
        this.ctx.closePath();
        this.ctx.fillStyle = '#8B0000';
        this.ctx.fill();

        this.ctx.restore();
    }

    _lighten(hex, amount) {
        return this._adjustColor(hex, amount);
    }

    _darken(hex, amount) {
        return this._adjustColor(hex, -amount);
    }

    _adjustColor(hex, amount) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
        const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    spin() {
        if (this.isSpinning || !this.items || this.items.length < 2) return;
        this.isSpinning = true;
        this.angularVelocity = Math.random() * 0.38 + 0.42;
        this.friction = 0.985 + Math.random() * 0.005;
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this._animate();
    }

    _animate() {
        if (!this.isSpinning) return;

        this.rotation += this.angularVelocity;
        this.rotation %= Math.PI * 2;
        this.angularVelocity *= this.friction;

        const count = this.items.length;
        const arc = (Math.PI * 2) / count;
        const pointerAngle = (Math.PI * 1.5 - this.rotation + Math.PI * 4) % (Math.PI * 2);
        const currentSegment = Math.floor(pointerAngle / arc) % count;

        if (currentSegment !== this.lastTickSegment) {
            this.lastTickSegment = currentSegment;
            if (window.arcadeSound) window.arcadeSound.wheelTick();
        }

        this.draw();

        if (this.angularVelocity < 0.002) {
            this.isSpinning = false;
            this.angularVelocity = 0;
            const winner = this.items[currentSegment];
            if (window.arcadeSound) window.arcadeSound.winnerFanfare();
            if (this.onSelected) this.onSelected(winner, currentSegment);
            return;
        }

        this.animFrameId = requestAnimationFrame(() => this._animate());
    }

    destroy() {
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        window.removeEventListener('resize', this._resizeHandler);
    }
}

window.WheelOfMisfortune = WheelOfMisfortune;
