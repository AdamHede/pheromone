// ============================================================
// SWARM — particles.js
// Ambient dust, hive pulse, delivery sparkle, pollen burst
// ============================================================

class ParticleSystem {
  constructor(rng) {
    this.particles = [];
    this.rng = rng;
  }

  // Ambient dust — always present, respawns
  spawnAmbientDust(canvasWidth, canvasHeight, count) {
    count = count || 25;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        type: 'dust',
        x: this.rng.range(0, canvasWidth),
        y: this.rng.range(0, canvasHeight),
        vx: this.rng.range(-0.15, 0.15),
        vy: this.rng.range(-0.15, 0.15),
        life: Infinity,
        maxLife: Infinity,
        alpha: this.rng.range(0.03, 0.08),
        size: this.rng.range(0.5, 1.5),
        color: [255, 240, 220],
        canvasWidth,
        canvasHeight,
      });
    }
  }

  // Hive placement — radial burst
  spawnHivePulse(x, y) {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.range(1.0, 3.0);
      this.particles.push({
        type: 'pulse',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(25, 50),
        maxLife: 50,
        alpha: 0.8,
        size: this.rng.range(1, 2.5),
        color: [255, 200, 100],
      });
    }
  }

  // Delivery sparkle — tiny burst at hive
  spawnDeliverySparkle(x, y) {
    const count = 4;
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.range(0.5, 1.5);
      this.particles.push({
        type: 'sparkle',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(10, 20),
        maxLife: 20,
        alpha: 1.0,
        size: this.rng.range(0.8, 1.5),
        color: [255, 220, 80],
      });
    }
  }

  // Flower depleted — pollen burst
  spawnPollenBurst(x, y, rgbColor) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.range(0.5, 2.0);
      const rgb = rgbColor || [200, 255, 200];
      this.particles.push({
        type: 'pollen',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(25, 45),
        maxLife: 45,
        alpha: 0.7,
        size: this.rng.range(1, 2),
        color: rgb,
      });
    }
  }

  // Bee eruption when "Go" is pressed — radial burst from hive
  spawnBeeEruption(x, y) {
    const count = 15;
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.range(2, 5);
      this.particles.push({
        type: 'eruption',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(15, 35),
        maxLife: 35,
        alpha: 0.9,
        size: this.rng.range(1.5, 3),
        color: [255, 230, 150],
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'dust') {
        // Dust wraps around
        if (p.x < 0) p.x = p.canvasWidth;
        if (p.x > p.canvasWidth) p.x = 0;
        if (p.y < 0) p.y = p.canvasHeight;
        if (p.y > p.canvasHeight) p.y = 0;
        // Slight drift variation
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;
        p.vx = clamp(p.vx, -0.3, 0.3);
        p.vy = clamp(p.vy, -0.3, 0.3);
        continue;
      }

      p.life--;
      p.alpha = (p.life / p.maxLife) * 0.8;
      p.vx *= 0.97; // friction
      p.vy *= 0.97;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  getParticles() {
    return this.particles;
  }

  clear() {
    this.particles = [];
  }
}
