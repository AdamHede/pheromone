// ============================================================
// SWARM — renderer.js
// ALL drawing: pheromone heatmap, bees, hives, flowers, glow, UI
// ============================================================

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Pheromone offscreen canvas (at GRID resolution, scaled up when drawn)
    this.pheromoneCanvas = null;
    this.pheromoneCtx = null;
    this.pheromoneImageData = null;
    this.pheromoneRenderCounter = 0;
    this.PHEROMONE_RENDER_INTERVAL = 2;

    // Pre-rendered glow sprites
    this.beeGlowSearching = this._createGlowSprite(12, [255, 235, 180], 0.7);
    this.beeGlowReturning = this._createGlowSprite(16, [255, 200, 80], 0.9);
    this.beeGlowFollowing = this._createGlowSprite(14, [255, 215, 120], 0.8);
    this.hiveGlowSprite = this._createGlowSprite(70, [255, 190, 80], 0.6);

    // Background grain
    this.perlin = new PerlinNoise(42);
    this.grainCanvas = document.createElement('canvas');
    this.grainCanvas.width = Math.ceil(this.width / 4);
    this.grainCanvas.height = Math.ceil(this.height / 4);
    this.grainCtx = this.grainCanvas.getContext('2d');
    this.grainTime = 0;
    this.grainCounter = 0;
    this.GRAIN_INTERVAL = 4;

    // Cursor preview state
    this.cursorX = -100;
    this.cursorY = -100;
    this.showCursor = false;

    // Pre-computed color lookup for pheromone
    this._explorationRGB = hslToRgb(200 / 360, 0.8, 0.5);  // Blue
    this._recruitmentRGB = hslToRgb(35 / 360, 0.9, 0.55);   // Amber
  }

  initPheromoneCanvas(grid) {
    this.pheromoneCanvas = document.createElement('canvas');
    this.pheromoneCanvas.width = grid.cols;
    this.pheromoneCanvas.height = grid.rows;
    this.pheromoneCtx = this.pheromoneCanvas.getContext('2d');
    this.pheromoneImageData = this.pheromoneCtx.createImageData(grid.cols, grid.rows);
  }

  _createGlowSprite(radius, rgb, intensity) {
    const size = radius * 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity})`);
    gradient.addColorStop(0.2, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * 0.6})`);
    gradient.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * 0.15})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  render(state, timestamp) {
    const ctx = this.ctx;

    // 1. Background
    this._drawBackground(ctx);

    // 2. Obstacles (source-over, very faint, below pheromone)
    if (state.map) {
      this._drawObstacles(ctx, state.map.obstacles);
    }

    // 3. Switch to additive blending
    ctx.globalCompositeOperation = 'lighter';

    // 4. Pheromone field
    if (state.pheromoneGrid) {
      this._drawPheromoneField(ctx, state.pheromoneGrid);
    }

    // 5. Flowers
    if (state.map) {
      this._drawFlowers(ctx, state.map.flowers, timestamp);
    }

    // 6. Hives
    this._drawHives(ctx, state.hives, timestamp);

    // 7. Bees
    this._drawBees(ctx, state.bees);

    // 8. Reset composite mode
    ctx.globalCompositeOperation = 'source-over';

    // 9. Particles
    if (state.particles) {
      this._drawParticles(ctx, state.particles.getParticles());
    }

    // 10. Cursor preview during placement
    if (this.showCursor && state.phase === 'placement') {
      this._drawCursorPreview(ctx);
    }
  }

  _drawBackground(ctx) {
    // Solid dark fill
    ctx.fillStyle = 'hsl(220, 12%, 3%)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Animated noise grain (subtle, updated every few frames)
    this.grainCounter++;
    if (this.grainCounter >= this.GRAIN_INTERVAL) {
      this.grainCounter = 0;
      this.grainTime += 0.5;
      this._updateGrain();
    }
    ctx.globalAlpha = 0.03;
    ctx.drawImage(this.grainCanvas, 0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }

  _updateGrain() {
    const gCtx = this.grainCtx;
    const w = this.grainCanvas.width;
    const h = this.grainCanvas.height;
    const imageData = gCtx.createImageData(w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = this.perlin.noise2D(x * 0.3 + this.grainTime, y * 0.3) * 0.5 + 0.5;
        const v = Math.floor(n * 80);
        const idx = (y * w + x) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    gCtx.putImageData(imageData, 0, 0);
  }

  _drawPheromoneField(ctx, grid) {
    if (!this.pheromoneCanvas) {
      this.initPheromoneCanvas(grid);
    }

    this.pheromoneRenderCounter++;
    if (this.pheromoneRenderCounter < this.PHEROMONE_RENDER_INTERVAL) {
      // Still draw the cached version
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
      return;
    }
    this.pheromoneRenderCounter = 0;

    const cols = grid.cols;
    const rows = grid.rows;
    const exploration = grid.exploration;
    const recruitment = grid.recruitment;
    const data = this.pheromoneImageData.data;

    const eR = this._explorationRGB[0];
    const eG = this._explorationRGB[1];
    const eB = this._explorationRGB[2];
    const rR = this._recruitmentRGB[0];
    const rG = this._recruitmentRGB[1];
    const rB = this._recruitmentRGB[2];

    for (let i = 0; i < cols * rows; i++) {
      const exp = exploration[i];
      const rec = recruitment[i];
      const pixIdx = i * 4;

      if (exp < 0.003 && rec < 0.003) {
        data[pixIdx] = 0;
        data[pixIdx + 1] = 0;
        data[pixIdx + 2] = 0;
        data[pixIdx + 3] = 0;
        continue;
      }

      // Blend exploration (blue) and recruitment (amber) by ratio
      const total = exp + rec;
      const recRatio = rec / (total + 0.001);

      // Interpolate color
      const r = lerp(eR, rR, recRatio);
      const g = lerp(eG, rG, recRatio);
      const b = lerp(eB, rB, recRatio);

      // Brightness proportional to concentration
      const brightness = clamp(total * 3.0, 0, 1);

      data[pixIdx]     = Math.floor(r * brightness * 255);
      data[pixIdx + 1] = Math.floor(g * brightness * 255);
      data[pixIdx + 2] = Math.floor(b * brightness * 255);
      data[pixIdx + 3] = Math.floor(brightness * 255);
    }

    this.pheromoneCtx.putImageData(this.pheromoneImageData, 0, 0);

    // Draw scaled up with bilinear filtering for soft glow
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
  }

  _drawObstacles(ctx, obstacles) {
    if (!obstacles) return;
    ctx.strokeStyle = 'rgba(80, 90, 110, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(40, 45, 55, 0.2)';

    for (const obs of obstacles) {
      if (obs.type === 'rect') {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      } else if (obs.type === 'circle') {
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  _drawFlowers(ctx, flowers, timestamp) {
    if (!flowers) return;
    for (const flower of flowers) {
      const brightness = flower.resource / flower.maxResource;
      const baseAlpha = 0.15 + brightness * 0.85;
      const radius = (6 + brightness * 6);

      // Harvest pulse effect
      let pulseScale = 1;
      if (flower.harvestPulse > 0) {
        pulseScale = 1 + flower.harvestPulse * 0.15;
        flower.harvestPulse *= 0.9;
        if (flower.harvestPulse < 0.01) flower.harvestPulse = 0;
      }

      // Subtle idle pulse
      const idlePulse = 1 + Math.sin(timestamp * 0.002 + flower.x * 0.01) * 0.05;
      const finalRadius = radius * pulseScale * idlePulse;

      // Glow
      const rgb = flower.rgbColor;
      const hsl = rgb; // [h, s, l]
      const glowColor = hslToString(hsl[0], hsl[1], hsl[2], baseAlpha * 0.3);
      const coreColor = hslToString(hsl[0], hsl[1], Math.min(hsl[2] + 15, 90), baseAlpha);

      // Outer glow
      ctx.beginPath();
      ctx.arc(flower.x, flower.y, finalRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(flower.x, flower.y, finalRadius, 0, Math.PI * 2);
      ctx.fillStyle = coreColor;
      ctx.fill();
    }
  }

  _drawHives(ctx, hives, timestamp) {
    for (const hive of hives) {
      const pulse = Math.sin(timestamp * 0.003) * 0.15 + 1; // ~0.5Hz
      const flashBoost = hive.flashTimer > 0 ? (hive.flashTimer / 8) * 0.5 : 0;

      // Large glow sprite
      const glowSize = 70 * pulse;
      ctx.globalAlpha = 0.4 + flashBoost;
      ctx.drawImage(
        this.hiveGlowSprite,
        hive.x - glowSize,
        hive.y - glowSize,
        glowSize * 2,
        glowSize * 2
      );
      ctx.globalAlpha = 1;

      // Core circle
      const radius = 12 * pulse;
      const lightness = 55 + flashBoost * 30;
      ctx.fillStyle = hslToString(35, 80, lightness, 0.9);
      ctx.beginPath();
      ctx.arc(hive.x, hive.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright center
      ctx.fillStyle = hslToString(40, 70, 80 + flashBoost * 15, 0.6);
      ctx.beginPath();
      ctx.arc(hive.x, hive.y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      if (hive.flashTimer > 0) hive.flashTimer--;
    }
  }

  _drawBees(ctx, bees) {
    for (const bee of bees) {
      if (!bee.active) continue;
      if (bee.state === BeeState.HARVESTING || bee.state === BeeState.DELIVERING) continue;

      // Motion trail
      for (let i = 0; i < bee.trail.length; i++) {
        const trailAge = (TRAIL_LENGTH - 1 - i);
        const pos = bee.trail[(bee.trailIndex + i) % TRAIL_LENGTH];
        if (!pos) continue;
        const alpha = (1 - trailAge / TRAIL_LENGTH) * 0.15;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = bee.state === BeeState.RETURNING
          ? 'rgb(255, 200, 80)'
          : 'rgb(255, 235, 180)';
        ctx.fillRect(pos.x - 0.75, pos.y - 0.75, 1.5, 1.5);
      }

      ctx.globalAlpha = 1;

      // Glow sprite
      let sprite, spriteSize;
      if (bee.state === BeeState.RETURNING) {
        sprite = this.beeGlowReturning;
        spriteSize = 16;
      } else {
        sprite = this.beeGlowSearching;
        spriteSize = 12;
      }

      ctx.drawImage(sprite, bee.x - spriteSize, bee.y - spriteSize, spriteSize * 2, spriteSize * 2);

      // Bright core
      const coreSize = bee.state === BeeState.RETURNING ? 2.5 : 2;
      ctx.fillStyle = bee.state === BeeState.RETURNING
        ? 'rgb(255, 220, 100)'
        : 'rgb(255, 245, 200)';
      ctx.fillRect(bee.x - coreSize / 2, bee.y - coreSize / 2, coreSize, coreSize);
    }
  }

  _drawParticles(ctx, particles) {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.alpha, 0, 1);
      ctx.fillStyle = `rgb(${p.color[0]}, ${p.color[1]}, ${p.color[2]})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  _drawCursorPreview(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    const glowSize = 40;
    ctx.globalAlpha = 0.25;
    ctx.drawImage(
      this.hiveGlowSprite,
      this.cursorX - glowSize,
      this.cursorY - glowSize,
      glowSize * 2,
      glowSize * 2
    );
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = hslToString(35, 80, 55, 0.5);
    ctx.beginPath();
    ctx.arc(this.cursorX, this.cursorY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Draw UI overlays (called separately so it's always source-over)
  drawUI(state, ctx) {
    if (!ctx) ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';

    // These are drawn by DOM elements in index.html instead
    // This method exists for any canvas-drawn UI needs (score animation, etc.)
  }

  setCursor(x, y, show) {
    this.cursorX = x;
    this.cursorY = y;
    this.showCursor = show;
  }
}
