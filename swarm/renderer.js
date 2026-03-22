// ============================================================
// SWARM — renderer.js
// ALL drawing: pheromone heatmap, bees, hives, flowers, glow, UI
// zones, wind, enemies, death animations
// ============================================================

class Renderer {
  constructor(canvas, dpr) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = dpr || 1;
    this.width = canvas.width / this.dpr;   // logical width (1280)
    this.height = canvas.height / this.dpr;  // logical height (720)

    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;

    // Pheromone offscreen canvas (at GRID resolution, scaled up when drawn)
    this.pheromoneCanvas = null;
    this.pheromoneCtx = null;
    this.pheromoneImageData = null;
    this.pheromoneBuf32 = null;
    this.pheromoneRenderCounter = 0;
    this.PHEROMONE_RENDER_INTERVAL = 2;

    // Pre-rendered glow sprites (at DPR resolution for crisp gradients)
    this.beeGlowSearching = this._createGlowSprite(9, [255, 235, 180], 0.7);
    this.beeGlowReturning = this._createGlowSprite(12, [255, 200, 80], 0.9);
    this.beeGlowFollowing = this._createGlowSprite(10, [255, 215, 120], 0.8);
    this.hiveGlowSprite = this._createGlowSprite(70, [255, 190, 80], 0.6);
    this.waspGlowSprite = this._createGlowSprite(20, [255, 50, 50], 0.8);

    // Background grain (intentionally low-res, stays at logical/4)
    this.perlin = new PerlinNoise(42);
    this.grainCanvas = document.createElement('canvas');
    this.grainCanvas.width = Math.ceil(this.width / 4);
    this.grainCanvas.height = Math.ceil(this.height / 4);
    this.grainCtx = this.grainCanvas.getContext('2d');
    this.grainImageData = this.grainCtx.createImageData(this.grainCanvas.width, this.grainCanvas.height);
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

    // Color LUT for pheromone rendering (built on first initPheromoneCanvas)
    this._pheromoneLUT = null;
  }

  setDpr(dpr) {
    this.dpr = dpr;
    this.width = this.canvas.width / dpr;
    this.height = this.canvas.height / dpr;

    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;

    this.beeGlowSearching = this._createGlowSprite(9, [255, 235, 180], 0.7);
    this.beeGlowReturning = this._createGlowSprite(12, [255, 200, 80], 0.9);
    this.beeGlowFollowing = this._createGlowSprite(10, [255, 215, 120], 0.8);
    this.hiveGlowSprite = this._createGlowSprite(70, [255, 190, 80], 0.6);
    this.waspGlowSprite = this._createGlowSprite(20, [255, 50, 50], 0.8);

    this.grainCanvas.width = Math.ceil(this.width / 4);
    this.grainCanvas.height = Math.ceil(this.height / 4);
    this.grainImageData = this.grainCtx.createImageData(this.grainCanvas.width, this.grainCanvas.height);
  }

  initPheromoneCanvas(grid) {
    this.pheromoneCanvas = document.createElement('canvas');
    this.pheromoneCanvas.width = grid.cols;
    this.pheromoneCanvas.height = grid.rows;
    this.pheromoneCtx = this.pheromoneCanvas.getContext('2d');
    this.pheromoneImageData = this.pheromoneCtx.createImageData(grid.cols, grid.rows);
    this.pheromoneBuf32 = new Uint32Array(this.pheromoneImageData.data.buffer);

    // Build color LUT: 64 exploration levels x 64 recruitment levels
    this._pheromoneLUT = new Uint32Array(64 * 64);
    const eR = this._explorationRGB[0], eG = this._explorationRGB[1], eB = this._explorationRGB[2];
    const rR = this._recruitmentRGB[0], rG = this._recruitmentRGB[1], rB = this._recruitmentRGB[2];

    for (let ei = 0; ei < 64; ei++) {
      for (let ri = 0; ri < 64; ri++) {
        const exp = ei / 63;
        const rec = ri / 63;
        const total = exp + rec;
        if (total < 0.003) {
          this._pheromoneLUT[ei * 64 + ri] = 0;
          continue;
        }
        const recRatio = rec / (total + 0.001);
        const r = lerp(eR, rR, recRatio);
        const g = lerp(eG, rG, recRatio);
        const b = lerp(eB, rB, recRatio);
        const brightness = clamp(total * 2.5, 0, 1);
        const R = (r * brightness * 255) | 0;
        const G = (g * brightness * 255) | 0;
        const B = (b * brightness * 255) | 0;
        const A = (brightness * 255) | 0;
        this._pheromoneLUT[ei * 64 + ri] = (A << 24) | (B << 16) | (G << 8) | R;
      }
    }
  }

  _createGlowSprite(radius, rgb, intensity) {
    const dpr = this.dpr;
    const size = radius * 2 * dpr;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    const center = radius * dpr;
    const r = radius * dpr;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, r);
    gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity})`);
    gradient.addColorStop(0.2, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * 0.6})`);
    gradient.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * 0.15})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  triggerShake(intensity) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  render(state, timestamp) {
    const ctx = this.ctx;

    // Apply screen shake
    if (this.shakeIntensity > 0) {
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.5) {
        this.shakeIntensity = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      }
    }

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    if (this.shakeIntensity > 0) {
      ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
    }

    // 1. Background
    this._drawBackground(ctx);

    // 2. Zones (always visible, below everything)
    if (state.map && state.map.zones) {
      this._drawZones(ctx, state.map.zones, timestamp);
    }

    // 2b. Wind exposure overlay (placement phase, shows shelter)
    if (state.map && state.map.wind && state.pheromoneGrid && state.phase === 'placement') {
      this._drawWindExposure(ctx, state.pheromoneGrid);
    }

    // 2c. Directional wind haze (strong wind maps — always visible)
    if (state.map && state.map.wind && state.map.wind.strength >= 0.8) {
      this._drawWindHaze(ctx, state.map.wind, timestamp, state.gustFactor);
    }

    // 3. Obstacles
    if (state.map) {
      this._drawObstacles(ctx, state.map.obstacles);
    }

    // 3b. Wind indicator (during placement — always shown, scales with strength)
    if (state.map && state.map.wind && state.phase === 'placement') {
      this._drawWindIndicator(ctx, state.map.wind, timestamp, state.gustFactor);
    }

    // 3c. Enemy patrol paths (during placement)
    if (state.enemies && state.enemies.length > 0 && state.phase === 'placement') {
      this._drawPatrolPaths(ctx, state.enemies);
    }

    // 4. Switch to additive blending
    ctx.globalCompositeOperation = 'lighter';

    // 5. Pheromone field
    if (state.pheromoneGrid) {
      this._drawPheromoneField(ctx, state.pheromoneGrid);
    }

    // 5b. Wind particles (all maps, all non-results phases — scales with strength)
    if (state.map && state.map.wind && state.phase !== 'results') {
      this._drawWindParticles(ctx, state.map.wind, timestamp, state.gustFactor);
    }

    // 6. Flowers
    if (state.map) {
      this._drawFlowers(ctx, state.map.flowers, timestamp);
    }

    // 7. Hives
    this._drawHives(ctx, state.hives, timestamp);

    // 8. Bees
    this._drawBees(ctx, state.bees);

    // 8b. Enemies (wasps)
    if (state.enemies && state.enemies.length > 0) {
      this._drawEnemies(ctx, state.enemies, timestamp);
    }

    // 9. Reset composite mode
    ctx.globalCompositeOperation = 'source-over';

    // 10. Particles
    if (state.particles) {
      this._drawParticles(ctx, state.particles.getParticles());
    }

    // 10b. Death animations
    this._drawDeathAnimations(ctx, state.bees);

    // 11. Cursor preview during placement
    if (this.showCursor && state.phase === 'placement') {
      this._drawCursorPreview(ctx, state);
    }

    ctx.restore();
  }

  _drawBackground(ctx) {
    ctx.fillStyle = 'hsl(220, 12%, 3%)';
    ctx.fillRect(0, 0, this.width, this.height);

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
    const w = this.grainCanvas.width;
    const h = this.grainCanvas.height;
    const buf32 = new Uint32Array(this.grainImageData.data.buffer);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = this.perlin.noise2D(x * 0.3 + this.grainTime, y * 0.3) * 0.5 + 0.5;
        const v = (n * 80) | 0;
        buf32[y * w + x] = 0xFF000000 | (v << 16) | (v << 8) | v;
      }
    }
    this.grainCtx.putImageData(this.grainImageData, 0, 0);
  }

  // === ZONES ===
  _drawZones(ctx, zones, timestamp) {
    for (const zone of zones) {
      const style = zone.visualStyle;
      const hsl = style.color;
      const pulse = 0.5 + Math.sin(timestamp * 0.001) * 0.05;

      if (zone.type === 'no-hive') {
        // Solid translucent fill with subtle animated border
        ctx.fillStyle = hslToString(hsl[0], hsl[1], hsl[2], 0.12);
        ctx.strokeStyle = hslToString(hsl[0], hsl[1], hsl[2] + 20, 0.25 * pulse);
        ctx.lineWidth = 1.5;
      } else if (zone.type === 'slow') {
        // Hatched appearance for slow zones
        ctx.fillStyle = hslToString(hsl[0], hsl[1], hsl[2], 0.08);
        ctx.strokeStyle = hslToString(hsl[0], hsl[1], hsl[2] + 15, 0.2);
        ctx.lineWidth = 1;
      }

      if (zone.shape === 'rect') {
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        // Label
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = hslToString(hsl[0], hsl[1], hsl[2] + 30, 1);
        ctx.font = '9px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(style.label, zone.x + zone.w / 2, zone.y + zone.h / 2 + 3);
        ctx.globalAlpha = 1;
      } else if (zone.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.globalAlpha = 0.15;
        ctx.fillStyle = hslToString(hsl[0], hsl[1], hsl[2] + 30, 1);
        ctx.font = '9px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(style.label, zone.x, zone.y + 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  // === WIND EXPOSURE OVERLAY (placement phase) ===
  _drawWindExposure(ctx, grid) {
    ctx.save();
    ctx.globalAlpha = 0.08;

    const cellW = this.width / grid.cols;
    const cellH = this.height / grid.rows;

    // Draw sheltered areas as blue tint (lower exposure = more visible)
    for (let r = 0; r < grid.rows; r += 2) { // Skip every other row for performance
      for (let c = 0; c < grid.cols; c += 2) {
        const idx = r * grid.cols + c;
        const exposure = grid.windExposure[idx];
        if (exposure >= 0.95) continue; // Fully exposed, skip

        const shelter = 1 - exposure; // 0..1 how sheltered
        ctx.globalAlpha = shelter * 0.12;
        ctx.fillStyle = 'rgb(100, 160, 255)';
        ctx.fillRect(c * cellW, r * cellH, cellW * 2, cellH * 2);
      }
    }

    ctx.restore();
  }

  // === WIND INDICATOR (placement phase) ===
  _drawWindIndicator(ctx, wind, timestamp, gustFactor) {
    const cx = this.width / 2;
    const cy = 65;
    const gust = gustFactor || 1;
    const str = wind.strength;
    const isStrong = str >= 0.8;
    const arrowLen = (20 + str * 25) * gust;

    ctx.save();
    const baseAlpha = isStrong ? 0.35 + gust * 0.2 : 0.15 + gust * 0.1;
    ctx.globalAlpha = baseAlpha;

    // Strong wind: warmer tint, thicker lines
    const color = isStrong ? '200, 220, 255' : '180, 200, 255';
    ctx.strokeStyle = `rgba(${color}, 0.7)`;
    ctx.lineWidth = isStrong ? 2 : 1.5;
    ctx.fillStyle = `rgba(${color}, 0.5)`;

    // Arrow count scales with strength
    const arrowCount = isStrong ? 5 : 3;
    const spread = isStrong ? 20 : 25;

    for (let i = 0; i < arrowCount; i++) {
      const offset = (i - (arrowCount - 1) / 2) * spread;
      const ox = cx + offset;
      const oy = cy;
      const drift = Math.sin(timestamp * 0.003 + i * 1.2) * (3 + str * 2) * gust;

      const ex = ox + Math.cos(wind.angle) * (arrowLen + drift);
      const ey = oy + Math.sin(wind.angle) * (arrowLen + drift);

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      const headLen = (5 + str * 3) * gust;
      const headAngle = 0.4;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(
        ex - Math.cos(wind.angle - headAngle) * headLen,
        ey - Math.sin(wind.angle - headAngle) * headLen
      );
      ctx.lineTo(
        ex - Math.cos(wind.angle + headAngle) * headLen,
        ey - Math.sin(wind.angle + headAngle) * headLen
      );
      ctx.closePath();
      ctx.fill();
    }

    // Label with strength tier
    ctx.fillStyle = `rgba(${color}, 0.4)`;
    ctx.font = `${isStrong ? 9 : 8}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    let strengthLabel;
    if (str >= 1.5) strengthLabel = 'GALE';
    else if (str >= 0.8) strengthLabel = 'STRONG WIND';
    else if (str >= 0.3) strengthLabel = 'BREEZE';
    else strengthLabel = 'LIGHT AIR';
    ctx.fillText(strengthLabel, cx, cy - 22);

    ctx.restore();
  }

  // === DIRECTIONAL WIND HAZE (strong wind maps — atmospheric overlay) ===
  _drawWindHaze(ctx, wind, timestamp, gustFactor) {
    const gust = gustFactor || 1;
    const str = wind.strength;
    const t = timestamp * 0.001;
    const wdx = Math.cos(wind.angle);
    const wdy = Math.sin(wind.angle);

    ctx.save();

    // Gradient haze bands that drift with wind direction
    const bandCount = Math.floor(3 + str * 3);
    for (let i = 0; i < bandCount; i++) {
      const seed = i * 137.5 + 31;
      const speed = str * (15 + (seed % 20));
      const rawOffset = seed * 7.3 + t * speed;

      // Position bands perpendicular to wind direction
      const perpX = -wdy;
      const perpY = wdx;
      const bandPos = ((rawOffset % (this.width + this.height)) + this.width) % (this.width + this.height);

      // Band center moves along wind direction
      const cx = bandPos * wdx + (this.width / 2) * perpX + Math.sin(t * 0.5 + seed) * 30;
      const cy = bandPos * wdy + (this.height / 2) * perpY + Math.cos(t * 0.7 + seed) * 20;

      // Elongated ellipse along wind direction
      const bandLen = 200 + str * 150 + (seed % 100);
      const bandWidth = 40 + (seed % 30);
      const alpha = (0.015 + gust * 0.02) * Math.min(str / 1.5, 1);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgb(160, 190, 240)';

      ctx.beginPath();
      ctx.ellipse(cx, cy, bandLen, bandWidth, wind.angle, 0, Math.PI * 2);
      ctx.fill();
    }

    // Edge darkening on the windward side (vignette)
    const vignetteAlpha = 0.04 * Math.min(str / 1.5, 1) * gust;
    if (vignetteAlpha > 0.005) {
      const gradX = this.width / 2 - wdx * this.width * 0.6;
      const gradY = this.height / 2 - wdy * this.height * 0.6;
      const gradEndX = this.width / 2 + wdx * this.width * 0.4;
      const gradEndY = this.height / 2 + wdy * this.height * 0.4;
      const grad = ctx.createLinearGradient(gradX, gradY, gradEndX, gradEndY);
      grad.addColorStop(0, `rgba(140, 170, 220, ${vignetteAlpha})`);
      grad.addColorStop(0.4, 'rgba(140, 170, 220, 0)');
      grad.addColorStop(1, 'rgba(140, 170, 220, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }

  // === WIND STREAKS (all phases except results, strength-scaled) ===
  _drawWindParticles(ctx, wind, timestamp, gustFactor) {
    const gust = gustFactor || 1;
    const t = timestamp * 0.001;
    const str = wind.strength;
    const effectiveStrength = str * gust;
    const wdx = Math.cos(wind.angle);
    const wdy = Math.sin(wind.angle);
    // Perpendicular for slight wave
    const pdx = -wdy;
    const pdy = wdx;

    // Strength multiplier for particle counts and alpha (subtle→dramatic)
    const intensityMult = Math.min(str / 0.3, 1); // ramps from 0→1 over strength 0→0.3
    const strongMult = str >= 0.8 ? (str - 0.5) / 1.5 : 0; // extra boost for strong wind

    // Layer 1: Flowing streaks
    const streakCount = Math.floor((5 + gust * 8) * intensityMult + strongMult * 30);
    ctx.lineCap = 'round';

    for (let i = 0; i < streakCount; i++) {
      const seed = i * 197.3 + 42;
      const seed2 = i * 83.7 + 17;

      // Base position wraps across canvas
      const speed = effectiveStrength * (60 + (seed % 40));
      const rawX = seed * 3.7 + t * speed * wdx;
      const rawY = seed2 * 2.3 + t * speed * wdy;
      const baseX = ((rawX % this.width) + this.width) % this.width;
      const baseY = ((rawY % this.height) + this.height) % this.height;

      // Streak length varies with strength and gust
      const len = (10 + effectiveStrength * 40 + (seed % 20)) * gust;

      // Slight wave motion perpendicular to wind
      const wavePhase = t * (1.5 + str) + seed * 0.1;
      const waveAmp = 2 + gust * 3 + str * 3;

      // Alpha: subtle on weak wind, visible on strong
      const baseAlpha = str < 0.5 ? 0.015 : 0.03;
      const brightness = baseAlpha + (seed % 100) / 100 * (0.03 + strongMult * 0.08) * gust;

      ctx.beginPath();
      ctx.strokeStyle = `rgba(180, 210, 255, ${brightness})`;
      ctx.lineWidth = 0.3 + str * 0.5 + gust * 0.5;

      // 3-point curve: start, wave peak, end
      const sx = baseX;
      const sy = baseY;
      const mx = baseX + wdx * len * 0.5 + pdx * Math.sin(wavePhase) * waveAmp;
      const my = baseY + wdy * len * 0.5 + pdy * Math.sin(wavePhase) * waveAmp;
      const ex = baseX + wdx * len + pdx * Math.sin(wavePhase + 1) * waveAmp * 0.5;
      const ey = baseY + wdy * len + pdy * Math.sin(wavePhase + 1) * waveAmp * 0.5;

      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }

    // Layer 2: Drifting dust dots
    const dotCount = Math.floor((4 + gust * 6) * intensityMult + strongMult * 20);
    for (let i = 0; i < dotCount; i++) {
      const seed = i * 271.1 + 99;
      const speed = effectiveStrength * (30 + (seed % 50));
      const rawX = seed * 5.1 + t * speed * wdx;
      const rawY = seed * 3.3 + t * speed * wdy;
      const x = ((rawX % this.width) + this.width) % this.width;
      const y = ((rawY % this.height) + this.height) % this.height;
      const alpha = (str < 0.5 ? 0.02 : 0.04) + gust * 0.04 * str;
      const size = 0.5 + str * 0.6 + gust * 0.4;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgb(200, 220, 255)';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Layer 3: Strong wind — large fast-moving wisps
    if (str >= 1.0) {
      const wispCount = Math.floor(3 + (str - 1.0) * 8);
      for (let i = 0; i < wispCount; i++) {
        const seed = i * 331.7 + 77;
        const seed2 = i * 157.3 + 53;
        const speed = effectiveStrength * (90 + (seed % 60));
        const rawX = seed * 4.1 + t * speed * wdx;
        const rawY = seed2 * 2.9 + t * speed * wdy;
        const baseX = ((rawX % this.width) + this.width) % this.width;
        const baseY = ((rawY % this.height) + this.height) % this.height;

        const wispLen = (60 + str * 60 + (seed % 40)) * gust;
        const wavePhase = t * 1.2 + seed * 0.05;
        const waveAmp = 8 + gust * 6;

        const wispAlpha = 0.02 + (seed % 50) / 50 * 0.04 * gust;

        ctx.beginPath();
        ctx.strokeStyle = `rgba(200, 225, 255, ${wispAlpha})`;
        ctx.lineWidth = 1.5 + gust * 1.5;

        const sx = baseX;
        const sy = baseY;
        const cx1 = baseX + wdx * wispLen * 0.33 + pdx * Math.sin(wavePhase) * waveAmp;
        const cy1 = baseY + wdy * wispLen * 0.33 + pdy * Math.sin(wavePhase) * waveAmp;
        const cx2 = baseX + wdx * wispLen * 0.66 + pdx * Math.sin(wavePhase + 1.5) * waveAmp;
        const cy2 = baseY + wdy * wispLen * 0.66 + pdy * Math.sin(wavePhase + 1.5) * waveAmp;
        const ex = baseX + wdx * wispLen;
        const ey = baseY + wdy * wispLen;

        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, ex, ey);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  // === PATROL PATHS (placement phase) ===
  _drawPatrolPaths(ctx, enemies) {
    ctx.save();
    ctx.globalAlpha = 0.2;

    for (const enemy of enemies) {
      if (enemy.patrol.length < 2) continue;

      // Draw dotted patrol path
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);

      ctx.beginPath();
      ctx.moveTo(enemy.patrol[0].x, enemy.patrol[0].y);
      for (let i = 1; i < enemy.patrol.length; i++) {
        ctx.lineTo(enemy.patrol[i].x, enemy.patrol[i].y);
      }
      // Close loop back to start
      ctx.lineTo(enemy.patrol[0].x, enemy.patrol[0].y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw kill radius preview at each waypoint
      ctx.fillStyle = 'rgba(255, 60, 60, 0.06)';
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.15)';
      for (const wp of enemy.patrol) {
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, enemy.killRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Wasp icon at current position
      ctx.fillStyle = 'rgba(255, 80, 80, 0.5)';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = 'rgba(255, 80, 80, 0.3)';
    ctx.font = '8px "Space Mono", monospace';
    ctx.textAlign = 'center';
    for (const enemy of enemies) {
      ctx.fillText('WASP', enemy.patrol[0].x, enemy.patrol[0].y - 12);
    }

    ctx.restore();
  }

  // === ENEMIES (during sim) ===
  _drawEnemies(ctx, enemies, timestamp) {
    for (const enemy of enemies) {
      // Glow
      const glowSize = 20;
      ctx.globalAlpha = 0.6 + Math.sin(timestamp * 0.005) * 0.15;
      ctx.drawImage(
        this.waspGlowSprite,
        enemy.x - glowSize,
        enemy.y - glowSize,
        glowSize * 2,
        glowSize * 2
      );

      // Body - angular, aggressive look
      ctx.globalAlpha = 0.9;
      const bodyLen = 5;
      const bodyWid = 2.5;
      const h = enemy.heading;

      // Abdomen (back)
      ctx.fillStyle = 'rgb(200, 50, 30)';
      ctx.beginPath();
      ctx.ellipse(
        enemy.x - Math.cos(h) * 2,
        enemy.y - Math.sin(h) * 2,
        bodyLen, bodyWid, h, 0, Math.PI * 2
      );
      ctx.fill();

      // Head (front)
      ctx.fillStyle = 'rgb(255, 80, 40)';
      ctx.beginPath();
      ctx.arc(
        enemy.x + Math.cos(h) * 3,
        enemy.y + Math.sin(h) * 3,
        2, 0, Math.PI * 2
      );
      ctx.fill();

      // Bright core
      ctx.fillStyle = 'rgb(255, 120, 60)';
      ctx.fillRect(enemy.x - 1, enemy.y - 1, 2, 2);

      ctx.globalAlpha = 1;
    }
  }

  // === DEATH ANIMATIONS ===
  _drawDeathAnimations(ctx, bees) {
    for (const bee of bees) {
      if (!bee.dead || bee.deathTimer <= 0) continue;

      const t = bee.deathTimer / 20; // 1.0 -> 0.0
      const size = 3 * t;
      ctx.globalAlpha = t * 0.7;
      ctx.fillStyle = `rgb(255, ${Math.floor(80 * t)}, ${Math.floor(30 * t)})`;
      ctx.beginPath();
      ctx.arc(bee.x, bee.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawPheromoneField(ctx, grid) {
    if (!this.pheromoneCanvas) {
      this.initPheromoneCanvas(grid);
    }

    this.pheromoneRenderCounter++;
    if (this.pheromoneRenderCounter < this.PHEROMONE_RENDER_INTERVAL) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
      return;
    }
    this.pheromoneRenderCounter = 0;

    const total = grid.cols * grid.rows;
    const exploration = grid.exploration;
    const recruitment = grid.recruitment;
    const buf32 = this.pheromoneBuf32;
    const lut = this._pheromoneLUT;

    for (let i = 0; i < total; i++) {
      const ei = (clamp(exploration[i], 0, 1) * 63 + 0.5) | 0;
      const ri = (clamp(recruitment[i], 0, 1) * 63 + 0.5) | 0;
      buf32[i] = lut[ei * 64 + ri];
    }

    this.pheromoneCtx.putImageData(this.pheromoneImageData, 0, 0);

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
      if (flower.resource <= 0) continue;

      const brightness = flower.resource / flower.maxResource;
      const baseAlpha = 0.15 + brightness * 0.85;
      const radius = (6 + brightness * 6);

      let pulseScale = 1;
      if (flower.harvestPulse > 0) {
        pulseScale = 1 + flower.harvestPulse * 0.3;
        flower.harvestPulse *= 0.85;
        if (flower.harvestPulse < 0.01) flower.harvestPulse = 0;
      }

      const idlePulse = 1 + Math.sin(timestamp * 0.002 + flower.x * 0.01) * 0.05;
      const finalRadius = radius * pulseScale * idlePulse;

      const rgb = flower.rgbColor;
      const hsl = rgb;
      const glowColor = hslToString(hsl[0], hsl[1], hsl[2], baseAlpha * 0.3);
      const coreColor = hslToString(hsl[0], hsl[1], Math.min(hsl[2] + 15, 90), baseAlpha);
      const petalColor = hslToString(hsl[0], hsl[1], Math.min(hsl[2] + 5, 80), baseAlpha * 0.8);

      ctx.beginPath();
      ctx.arc(flower.x, flower.y, finalRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();

      const petalCount = 6;
      const petalLength = finalRadius * 1.4;
      ctx.fillStyle = petalColor;
      for (let i = 0; i < petalCount; i++) {
        const angle = timestamp * 0.0005 + (i * Math.PI * 2) / petalCount;
        const px = flower.x + Math.cos(angle) * petalLength * 0.5;
        const py = flower.y + Math.sin(angle) * petalLength * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, finalRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(flower.x, flower.y, finalRadius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = coreColor;
      ctx.fill();
    }
  }

  _drawHives(ctx, hives, timestamp) {
    for (const hive of hives) {
      const pulse = Math.sin(timestamp * 0.003) * 0.15 + 1;
      const flashBoost = hive.flashTimer > 0 ? (hive.flashTimer / 8) * 0.5 : 0;
      const deliveryBoost = hive.pulseT || 0;

      const glowSize = 70 * pulse + (deliveryBoost * 20);
      ctx.globalAlpha = 0.4 + flashBoost;
      ctx.drawImage(
        this.hiveGlowSprite,
        hive.x - glowSize,
        hive.y - glowSize,
        glowSize * 2,
        glowSize * 2
      );
      ctx.globalAlpha = 1;

      const radius = 14 * pulse + (deliveryBoost * 3);
      const lightness = 55 + flashBoost * 30 + deliveryBoost * 20;

      const drawHex = (x, y, r, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 + (timestamp * 0.0005);
          const hx = x + Math.cos(angle) * r;
          const hy = y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
      };

      drawHex(hive.x, hive.y, radius, hslToString(35, 80, lightness, 0.9));
      drawHex(hive.x, hive.y, radius * 0.5, hslToString(40, 70, 80 + flashBoost * 15, 0.6));

      ctx.fillStyle = hslToString(35, 90, lightness + 10, 0.5);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + (timestamp * 0.0005);
        const subR = radius * 0.6;
        const subX = hive.x + Math.cos(angle) * subR;
        const subY = hive.y + Math.sin(angle) * subR;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
            const angle2 = (j * Math.PI) / 3 + (timestamp * 0.0005);
            const hexR = radius * 0.25;
            const hx = subX + Math.cos(angle2) * hexR;
            const hy = subY + Math.sin(angle2) * hexR;
            if (j === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
      }

      if (hive.flashTimer > 0) hive.flashTimer--;
    }
  }

  _drawBees(ctx, bees) {
    for (const bee of bees) {
      if (!bee.active || bee.dead) continue;
      if (bee.state === BeeState.HARVESTING || bee.state === BeeState.DELIVERING) continue;

      // Motion trail (flat Float32Array: [x0, y0, x1, y1, ...])
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const trailAge = (TRAIL_LENGTH - 1 - i);
        const ti = ((bee.trailIndex + i) % TRAIL_LENGTH) * 2;
        const px = bee.trail[ti];
        const py = bee.trail[ti + 1];
        const alpha = (1 - trailAge / TRAIL_LENGTH) * 0.15;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = bee.state === BeeState.RETURNING
          ? 'rgb(255, 200, 80)'
          : 'rgb(255, 235, 180)';
        ctx.fillRect(px - 0.5, py - 0.5, 1.0, 1.0);
      }

      ctx.globalAlpha = 1;

      let sprite, spriteSize;
      if (bee.state === BeeState.RETURNING) {
        sprite = this.beeGlowReturning;
        spriteSize = 12;
      } else {
        sprite = this.beeGlowSearching;
        spriteSize = 9;
      }

      ctx.drawImage(sprite, bee.x - spriteSize, bee.y - spriteSize, spriteSize * 2, spriteSize * 2);

      const coreSize = bee.state === BeeState.RETURNING ? 1.8 : 1.4;
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

  _drawCursorPreview(ctx, state) {
    // Check if cursor is in a no-hive zone
    let blocked = false;
    if (state && state.map && state.map.zones) {
      for (const zone of state.map.zones) {
        if (zone.type === 'no-hive' && isInsideZone(this.cursorX, this.cursorY, zone)) {
          blocked = true;
          break;
        }
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    const glowSize = 40;

    if (blocked) {
      // Red-tinted preview for blocked placement
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = 'rgba(255, 60, 60, 0.3)';
      ctx.beginPath();
      ctx.arc(this.cursorX, this.cursorY, 15, 0, Math.PI * 2);
      ctx.fill();
    } else {
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
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawUI(state, ctx) {
    if (!ctx) ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
  }

  setCursor(x, y, show) {
    this.cursorX = x;
    this.cursorY = y;
    this.showCursor = show;
  }
}
