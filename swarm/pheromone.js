// ============================================================
// SWARM — pheromone.js
// Double-buffered pheromone grid: deposit, sample, diffuse, evaporate
// ============================================================

class PheromoneGrid {
  constructor(width, height, cellSize) {
    this.cellSize = cellSize || 6;
    this.cols = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);
    this.totalCells = this.cols * this.rows;
    this.width = width;
    this.height = height;

    // Double-buffered Float32Arrays
    this.exploration = new Float32Array(this.totalCells);
    this.explorationNext = new Float32Array(this.totalCells);
    this.recruitment = new Float32Array(this.totalCells);
    this.recruitmentNext = new Float32Array(this.totalCells);

    // Running totals for audio (avoid full grid scans)
    this._totalExploration = 0;
    this._totalRecruitment = 0;

    // Obstacle mask: 1 = passable, 0 = blocked
    this.passable = new Uint8Array(this.totalCells);
    this.passable.fill(1);

    // Speed multiplier grid: 1.0 = normal, <1.0 = slow zone
    this.speedMult = new Float32Array(this.totalCells);
    this.speedMult.fill(1.0);
  }

  // Convert world coords to grid index
  _toIndex(wx, wy) {
    const col = Math.floor(wx / this.cellSize);
    const row = Math.floor(wy / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  _toColRow(wx, wy) {
    return {
      col: Math.floor(wx / this.cellSize),
      row: Math.floor(wy / this.cellSize),
    };
  }

  // Deposit pheromone at world position
  deposit(wx, wy, type, amount) {
    const idx = this._toIndex(wx, wy);
    if (idx < 0 || !this.passable[idx]) return;
    if (type === 'exploration') {
      const before = this.exploration[idx];
      this.exploration[idx] = Math.min(before + amount, 1.0);
      this._totalExploration += this.exploration[idx] - before;
    } else {
      const before = this.recruitment[idx];
      this.recruitment[idx] = Math.min(before + amount, 1.0);
      this._totalRecruitment += this.recruitment[idx] - before;
    }
  }

  // Sample pheromone with bilinear interpolation
  sample(wx, wy, type) {
    const cx = wx / this.cellSize - 0.5;
    const cy = wy / this.cellSize - 0.5;
    const col0 = Math.floor(cx);
    const row0 = Math.floor(cy);
    const fx = cx - col0;
    const fy = cy - row0;

    const arr = type === 'exploration' ? this.exploration : this.recruitment;

    const v00 = this._safeRead(arr, col0, row0);
    const v10 = this._safeRead(arr, col0 + 1, row0);
    const v01 = this._safeRead(arr, col0, row0 + 1);
    const v11 = this._safeRead(arr, col0 + 1, row0 + 1);

    return (1 - fx) * (1 - fy) * v00
         + fx * (1 - fy) * v10
         + (1 - fx) * fy * v01
         + fx * fy * v11;
  }

  _safeRead(arr, col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
    return arr[row * this.cols + col];
  }

  // Sample in three directions for bee steering
  sampleDirection(wx, wy, heading, sensorAngle, sensorDist, type) {
    const leftAngle = heading - sensorAngle;
    const rightAngle = heading + sensorAngle;

    const lx = wx + Math.cos(leftAngle) * sensorDist;
    const ly = wy + Math.sin(leftAngle) * sensorDist;
    const cx = wx + Math.cos(heading) * sensorDist;
    const cy = wy + Math.sin(heading) * sensorDist;
    const rx = wx + Math.cos(rightAngle) * sensorDist;
    const ry = wy + Math.sin(rightAngle) * sensorDist;

    return {
      left: this.sample(lx, ly, type),
      center: this.sample(cx, cy, type),
      right: this.sample(rx, ry, type),
    };
  }

  // Check if a world position is passable
  isPassable(wx, wy) {
    const idx = this._toIndex(wx, wy);
    if (idx < 0) return false;
    return this.passable[idx] === 1;
  }

  // Mark rectangular obstacle area
  markObstacleRect(x, y, w, h) {
    const col0 = Math.max(0, Math.floor(x / this.cellSize));
    const row0 = Math.max(0, Math.floor(y / this.cellSize));
    const col1 = Math.min(this.cols - 1, Math.floor((x + w) / this.cellSize));
    const row1 = Math.min(this.rows - 1, Math.floor((y + h) / this.cellSize));
    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        this.passable[r * this.cols + c] = 0;
      }
    }
  }

  // Get speed multiplier at world position
  getSpeedMult(wx, wy) {
    const idx = this._toIndex(wx, wy);
    if (idx < 0) return 1.0;
    return this.speedMult[idx];
  }

  // Mark rectangular slow zone
  markSlowRect(x, y, w, h, mult) {
    const col0 = Math.max(0, Math.floor(x / this.cellSize));
    const row0 = Math.max(0, Math.floor(y / this.cellSize));
    const col1 = Math.min(this.cols - 1, Math.floor((x + w) / this.cellSize));
    const row1 = Math.min(this.rows - 1, Math.floor((y + h) / this.cellSize));
    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        this.speedMult[r * this.cols + c] = Math.min(this.speedMult[r * this.cols + c], mult);
      }
    }
  }

  // Mark circular slow zone
  markSlowCircle(cx, cy, radius, mult) {
    const col0 = Math.max(0, Math.floor((cx - radius) / this.cellSize));
    const row0 = Math.max(0, Math.floor((cy - radius) / this.cellSize));
    const col1 = Math.min(this.cols - 1, Math.ceil((cx + radius) / this.cellSize));
    const row1 = Math.min(this.rows - 1, Math.ceil((cy + radius) / this.cellSize));
    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        const px = (c + 0.5) * this.cellSize;
        const py = (r + 0.5) * this.cellSize;
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          this.speedMult[r * this.cols + c] = Math.min(this.speedMult[r * this.cols + c], mult);
        }
      }
    }
  }

  // Mark circular obstacle area
  markObstacleCircle(cx, cy, radius) {
    const col0 = Math.max(0, Math.floor((cx - radius) / this.cellSize));
    const row0 = Math.max(0, Math.floor((cy - radius) / this.cellSize));
    const col1 = Math.min(this.cols - 1, Math.ceil((cx + radius) / this.cellSize));
    const row1 = Math.min(this.rows - 1, Math.ceil((cy + radius) / this.cellSize));
    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        const px = (c + 0.5) * this.cellSize;
        const py = (r + 0.5) * this.cellSize;
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          this.passable[r * this.cols + c] = 0;
        }
      }
    }
  }

  // Diffusion + evaporation update (merged dual-channel pass)
  update(diffusionRate, evaporationRate) {
    this._diffuseBoth(diffusionRate, evaporationRate);

    // Swap buffers
    let tmp = this.exploration;
    this.exploration = this.explorationNext;
    this.explorationNext = tmp;

    tmp = this.recruitment;
    this.recruitment = this.recruitmentNext;
    this.recruitmentNext = tmp;
  }

  _diffuseBoth(diffusionRate, evaporationRate) {
    const cols = this.cols;
    const rows = this.rows;
    const passable = this.passable;
    const expCur = this.exploration, expNxt = this.explorationNext;
    const recCur = this.recruitment, recNxt = this.recruitmentNext;
    const oneMinusDiff = 1 - diffusionRate;
    let totalExp = 0, totalRec = 0;

    // Interior cells (no boundary checks needed)
    for (let r = 1; r < rows - 1; r++) {
      const rowOff = r * cols;
      for (let c = 1; c < cols - 1; c++) {
        const idx = rowOff + c;

        if (!passable[idx]) {
          expNxt[idx] = 0;
          recNxt[idx] = 0;
          continue;
        }

        // Unrolled 8-neighbor indices (all guaranteed in-bounds)
        const i_tl = idx - cols - 1, i_t = idx - cols, i_tr = idx - cols + 1;
        const i_l = idx - 1, i_r = idx + 1;
        const i_bl = idx + cols - 1, i_b = idx + cols, i_br = idx + cols + 1;

        let expNS = 0, recNS = 0, nc = 0;
        if (passable[i_tl]) { expNS += expCur[i_tl]; recNS += recCur[i_tl]; nc++; }
        if (passable[i_t])  { expNS += expCur[i_t];  recNS += recCur[i_t];  nc++; }
        if (passable[i_tr]) { expNS += expCur[i_tr]; recNS += recCur[i_tr]; nc++; }
        if (passable[i_l])  { expNS += expCur[i_l];  recNS += recCur[i_l];  nc++; }
        if (passable[i_r])  { expNS += expCur[i_r];  recNS += recCur[i_r];  nc++; }
        if (passable[i_bl]) { expNS += expCur[i_bl]; recNS += recCur[i_bl]; nc++; }
        if (passable[i_b])  { expNS += expCur[i_b];  recNS += recCur[i_b];  nc++; }
        if (passable[i_br]) { expNS += expCur[i_br]; recNS += recCur[i_br]; nc++; }

        if (nc > 0) {
          const invCount = 1 / nc;
          const eResult = (expCur[idx] * oneMinusDiff + expNS * invCount * diffusionRate) * evaporationRate;
          const rResult = (recCur[idx] * oneMinusDiff + recNS * invCount * diffusionRate) * evaporationRate;
          expNxt[idx] = eResult;
          recNxt[idx] = rResult;
          totalExp += eResult;
          totalRec += rResult;
        } else {
          expNxt[idx] = 0;
          recNxt[idx] = 0;
        }
      }
    }

    // Border cells (with boundary checks)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Skip interior cells already processed
        if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) continue;

        const idx = r * cols + c;
        if (!passable[idx]) {
          expNxt[idx] = 0;
          recNxt[idx] = 0;
          continue;
        }

        let expNS = 0, recNS = 0, nc = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, ncol = c + dc;
            if (nr < 0 || nr >= rows || ncol < 0 || ncol >= cols) continue;
            const ni = nr * cols + ncol;
            if (!passable[ni]) continue;
            expNS += expCur[ni];
            recNS += recCur[ni];
            nc++;
          }
        }

        if (nc > 0) {
          const invCount = 1 / nc;
          const eResult = (expCur[idx] * oneMinusDiff + expNS * invCount * diffusionRate) * evaporationRate;
          const rResult = (recCur[idx] * oneMinusDiff + recNS * invCount * diffusionRate) * evaporationRate;
          expNxt[idx] = eResult;
          recNxt[idx] = rResult;
          totalExp += eResult;
          totalRec += rResult;
        } else {
          expNxt[idx] = 0;
          recNxt[idx] = 0;
        }
      }
    }

    this._totalExploration = totalExp;
    this._totalRecruitment = totalRec;
  }

  // Total intensity (from running totals — no grid scan)
  getTotalIntensity() {
    return this._totalExploration + this._totalRecruitment;
  }

  // Total recruitment intensity (from running total)
  getRecruitmentIntensity() {
    return this._totalRecruitment;
  }

  reset() {
    this.exploration.fill(0);
    this.explorationNext.fill(0);
    this.recruitment.fill(0);
    this.recruitmentNext.fill(0);
    this._totalExploration = 0;
    this._totalRecruitment = 0;
  }
}
