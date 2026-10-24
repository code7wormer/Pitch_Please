class WheelOfPitch {
    constructor(canvasId, onSelected) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.onSelected = onSelected;
        this.teams = [];
        this.rotation = 0;
        this.angularVelocity = 0;
        this.friction = 0.985;
        this.isSpinning = false;
        this.lastTickSegment = -1;

        // Vivid arcade palette
        this.colors = [
            '#00ff66', '#00e5ff', '#ff007f', '#ffe600',
            '#bf00ff', '#ff5100', '#00ffc4', '#ff3366',
            '#39ff14', '#7000ff', '#ff9900', '#00b4d8'
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const size = Math.min(rect.width || 360, 480);
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.ctx.scale(dpr, dpr);
        this.displayWidth = size;
        this.displayHeight = size;
        this.draw();
    }

    setTeams(teams, totalActiveCount = 0) {
        this.teams = teams;
        this.totalActiveCount = totalActiveCount;
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        const width = this.displayWidth;
        const height = this.displayHeight;
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(cx, cy) - 16;

        this.ctx.clearRect(0, 0, width, height);

        if (!this.teams || this.teams.length === 0) {
            // Empty wheel placeholder
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#141822';
            this.ctx.fill();
            this.ctx.strokeStyle = this.totalActiveCount > 0 ? '#ffe600' : '#00ff66';
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            this.ctx.fillStyle = this.totalActiveCount > 0 ? '#ffe600' : '#8b9bb4';
            this.ctx.font = '12px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const emptyText = this.totalActiveCount > 0 ? 'ALL TEAMS PITCHED!' : 'ADD TEAMS FIRST';
            this.ctx.fillText(emptyText, cx, cy);
            this.ctx.restore();
            return;
        }

        const count = this.teams.length;
        const arc = (Math.PI * 2) / count;

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate(this.rotation);

        // Draw segments
        for (let i = 0; i < count; i++) {
            const angle = i * arc;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, radius, angle, angle + arc);
            this.ctx.closePath();

            this.ctx.fillStyle = this.colors[i % this.colors.length];
            this.ctx.fill();

            this.ctx.strokeStyle = '#05070a';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // Draw text
            this.ctx.save();
            this.ctx.rotate(angle + arc / 2);
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = '#05070a';
            this.ctx.font = 'bold 13px "Chakra Petch", monospace';

            // Truncate long team names
            let name = this.teams[i].name;
            if (name.length > 14) name = name.substring(0, 12) + '..';

            this.ctx.shadowColor = 'rgba(255,255,255,0.4)';
            this.ctx.shadowBlur = 4;
            this.ctx.fillText(name, radius - 16, 5);
            this.ctx.restore();
        }

        // Center hub
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 32, 0, Math.PI * 2);
        this.ctx.fillStyle = '#05070a';
        this.ctx.fill();
        this.ctx.strokeStyle = '#00ff66';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.restore();

        // Outer glow rim
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#00ff66';
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = '#00ff66';
        this.ctx.shadowBlur = 12;
        this.ctx.stroke();
        this.ctx.restore();

        // Fixed Top Pointer (at 12 o'clock, pointing down)
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - radius + 22);
        this.ctx.lineTo(cx - 16, cy - radius - 12);
        this.ctx.lineTo(cx + 16, cy - radius - 12);
        this.ctx.closePath();
        this.ctx.fillStyle = '#ff0055';
        this.ctx.shadowColor = '#ff0055';
        this.ctx.shadowBlur = 12;
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();
    }

    spin() {
        if (this.isSpinning || !this.teams || this.teams.length === 0) return;
        this.isSpinning = true;
        // Random spin velocity (fast initial speed)
        this.angularVelocity = Math.random() * 0.35 + 0.45;
        this.friction = Math.random() * 0.003 + 0.985;
        this.animate();
    }

    animate() {
        if (!this.isSpinning) return;

        this.rotation += this.angularVelocity;
        this.rotation %= Math.PI * 2;
        this.angularVelocity *= this.friction;

        // Sound tick check
        const count = this.teams.length;
        const arc = (Math.PI * 2) / count;
        // Pointer is at -PI/2 (12 o'clock)
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
            const winningTeam = this.teams[currentSegment];
            if (window.arcadeSound) window.arcadeSound.winnerFanfare();
            if (this.onSelected) {
                this.onSelected(winningTeam);
            }
            return;
        }

        requestAnimationFrame(() => this.animate());
    }
}

window.WheelOfPitch = WheelOfPitch;
