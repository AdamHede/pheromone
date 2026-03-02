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

    // Obstacle mask: 1 = passable, 0 = blocked
    this.passable = new Uint8Array(this.totalCells);
    this.passable.fill(1);

    // Pre-compute neighbor offsets for 8-connected diffusion
    this._neighborOffsets = [
      -this.cols - 1, -this.cols, -this.cols + 1,
      -1,                          1,
       this.cols - 1,  this.cols,  this.cols + 1,
    ];
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
      this.exploration[idx] = Math.min(this.exploration[idx] + amount, 1.0);
    } else {
      this.recruitment[idx] = Math.min(this.recruitment[idx] + amount, 1.0);
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

  // Diffusion + evaporation update
  update(diffusionRate, evaporationRate) {
    this._diffuseAndEvaporate(this.exploration, this.explorationNext, diffusionRate, evaporationRate);
    this._diffuseAndEvaporate(this.recruitment, this.recruitmentNext, diffusionRate, evaporationRate);

    // Swap buffers
    let tmp = this.exploration;
    this.exploration = this.explorationNext;
    this.explorationNext = tmp;

    tmp = this.recruitment;
    this.recruitment = this.recruitmentNext;
    this.recruitmentNext = tmp;
  }

  _diffuseAndEvaporate(current, next, diffusionRate, evaporationRate) {
    const cols = this.cols;
    const rows = this.rows;
    const passable = this.passable;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;

        if (!passable[idx]) {
          next[idx] = 0;
          continue;
        }

        const val = current[idx];

        // Skip near-zero cells for performance
        if (val < 0.0005) {
          // Still need to check if neighbors would contribute
          let neighborSum = 0;
          let neighborCount = 0;
          // Check 8 neighbors
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
              const ni = nr * cols + nc;
              if (!passable[ni]) continue;
              neighborSum += current[ni];
              neighborCount++;
            }
          }
          if (neighborSum < 0.0005) {
            next[idx] = 0;
            continue;
          }
          const avgNeighbor = neighborSum / neighborCount;
          next[idx] = (val * (1 - diffusionRate) + avgNeighbor * diffusionRate) * evaporationRate;
          continue;
        }

        // Full diffusion calculation
        let neighborSum = 0;
        let neighborCount = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            const ni = nr * cols + nc;
            if (!passable[ni]) continue;
            neighborSum += current[ni];
            neighborCount++;
          }
        }

        const avgNeighbor = neighborCount > 0 ? neighborSum / neighborCount : 0;
        next[idx] = (val * (1 - diffusionRate) + avgNeighbor * diffusionRate) * evaporationRate;
      }
    }
  }

  // Total intensity across entire grid (for audio scaling)
  getTotalIntensity() {
    let total = 0;
    for (let i = 0; i < this.totalCells; i++) {
      total += this.exploration[i] + this.recruitment[i];
    }
    return total;
  }

  // Total recruitment intensity (for highway detection)
  getRecruitmentIntensity() {
    let total = 0;
    for (let i = 0; i < this.totalCells; i++) {
      total += this.recruitment[i];
    }
    return total;
  }

  reset() {
    this.exploration.fill(0);
    this.explorationNext.fill(0);
    this.recruitment.fill(0);
    this.recruitmentNext.fill(0);
  }
}
