// ============================================================
// SWARM — utils.js
// Seeded PRNG, Perlin noise, vector math, color & math helpers
// ============================================================

// --- Seeded PRNG (Mulberry32) ---
class SeededRandom {
  constructor(seed) {
    this.state = seed | 0;
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + this.next() * (b - a);
  }

  int(a, b) {
    return Math.floor(this.range(a, b));
  }

  chance(p) {
    return this.next() < p;
  }
}

// --- 2D Perlin Noise ---
class PerlinNoise {
  constructor(seed) {
    const rng = new SeededRandom(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  _grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this._fade(xf);
    const v = this._fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this._grad(aa, xf, yf), this._grad(ba, xf - 1, yf), u);
    const x2 = lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }
}

// --- Vector Math (plain {x, y} objects) ---
function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vecScale(v, s) {
  return { x: v.x * s, y: v.y * s };
}

function vecLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function vecNormalize(v) {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function vecDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function vecAngle(v) {
  return Math.atan2(v.y, v.x);
}

function vecFromAngle(radians) {
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

// --- Color Helpers ---
function hslToString(h, s, l, a) {
  if (a === undefined) a = 1;
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function hslToRgb(h, s, l) {
  // h, s, l in [0, 1]
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

function lerpColor(c1, c2, t) {
  // c1, c2 are [h, s, l] arrays with h in degrees, s/l in percent
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

// --- Math Helpers ---
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

function mapRange(val, inMin, inMax, outMin, outMax) {
  return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function degToRad(deg) {
  return deg * (Math.PI / 180);
}

function radToDeg(rad) {
  return rad * (180 / Math.PI);
}

function normalizeAngle(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function angleDiff(a, b) {
  return normalizeAngle(b - a);
}
