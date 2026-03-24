// ============================================================
// SWARM — map.js
// Map definitions, loading, and procedural generation
// ============================================================

// Flower color palette (soft, distinct from pheromone colors)
const FLOWER_COLORS = {
  green:  [140, 50, 52],  // [h, s%, l%] — slightly muted
  purple: [280, 40, 57],
  pink:   [330, 45, 57],
  blue:   [210, 40, 52],
  white:  [60, 15, 72],
};

// Zone visual styles
const ZONE_VISUALS = {
  water: { color: [180, 60, 40], label: 'WATER' },
  mud:   { color: [30, 40, 30], label: 'MUD' },
  rock:  { color: [0, 0, 35], label: 'ROCK' },
  thorns: { color: [0, 50, 30], label: 'THORNS' },
};

// All positions in normalized [0-1] coordinates
const MAPS = [
  // ──────────────────────────────────────────────
  // ACT 1: LEARNING THE SWARM
  // ──────────────────────────────────────────────

  // === MAP 1: Tutorial — can't lose ===
  {
    id: 1,
    name: 'First Light',
    description: 'A meadow at dawn. Place your hive near the flowers.',
    hivesAllowed: 1,
    beeCount: 150,
    simDuration: 45,
    starThresholds: [20, 35, 50],
    flowers: [
      // Tight cluster — impossible to miss
      { x: 0.55, y: 0.42, resource: 30, color: 'green' },
      { x: 0.52, y: 0.48, resource: 25, color: 'purple' },
      { x: 0.58, y: 0.50, resource: 28, color: 'pink' },
      { x: 0.54, y: 0.55, resource: 22, color: 'green' },
      { x: 0.57, y: 0.45, resource: 26, color: 'white' },
    ],
    obstacles: [],
    wind: { angle: Math.PI * 0.15, strength: 0.15, gustSpeed: 0.001, gustRange: 0.2 },
  },

  // === MAP 2: The fork — two paths ===
  {
    id: 2,
    name: 'Two Meadows',
    description: 'North or south? The swarm will decide.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 50,
    starThresholds: [50, 75, 90],
    flowers: [
      // Upper cluster
      { x: 0.78, y: 0.22, resource: 25, color: 'purple' },
      { x: 0.82, y: 0.25, resource: 30, color: 'green' },
      { x: 0.80, y: 0.18, resource: 22, color: 'pink' },
      { x: 0.76, y: 0.26, resource: 28, color: 'white' },
      // Lower cluster
      { x: 0.78, y: 0.75, resource: 25, color: 'green' },
      { x: 0.82, y: 0.72, resource: 30, color: 'purple' },
      { x: 0.80, y: 0.78, resource: 22, color: 'blue' },
      { x: 0.76, y: 0.70, resource: 28, color: 'pink' },
    ],
    obstacles: [],
    wind: { angle: Math.PI * 1.7, strength: 0.2, gustSpeed: 0.0015, gustRange: 0.25 },
  },

  // ──────────────────────────────────────────────
  // ACT 2: THE TERRAIN
  // ──────────────────────────────────────────────

  // === MAP 3: The lake — ZONE MAP ===
  {
    id: 3,
    name: 'The Lake',
    description: 'A body of water lies between you and the garden.',
    hivesAllowed: 1,
    beeCount: 180,
    simDuration: 50,
    starThresholds: [45, 70, 88],
    flowers: [
      // Garden on the far side of the lake
      { x: 0.80, y: 0.30, resource: 28, color: 'green' },
      { x: 0.82, y: 0.42, resource: 30, color: 'purple' },
      { x: 0.78, y: 0.50, resource: 25, color: 'pink' },
      { x: 0.84, y: 0.58, resource: 28, color: 'white' },
      { x: 0.80, y: 0.68, resource: 32, color: 'blue' },
    ],
    obstacles: [],
    zones: [
      // The lake — large, central, forces you to pick a side
      { type: 'no-hive', shape: 'circle', x: 0.45, y: 0.48, r: 0.15, visual: 'water' },
    ],
    wind: { angle: Math.PI * 0.5, strength: 0.25, gustSpeed: 0.002, gustRange: 0.3 },
  },

  // ──────────────────────────────────────────────
  // ACT 3: THE WIND
  // ──────────────────────────────────────────────

  // === MAP 4: Open gale — pure WIND MAP ===
  {
    id: 4,
    name: 'Open Gale',
    description: 'No shelter. The wind takes everything.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [40, 62, 82],
    flowers: [
      // Flowers upwind (left) — bees must fight the wind to reach them
      { x: 0.15, y: 0.30, resource: 25, color: 'green' },
      { x: 0.18, y: 0.45, resource: 30, color: 'purple' },
      { x: 0.12, y: 0.55, resource: 28, color: 'pink' },
      { x: 0.20, y: 0.65, resource: 25, color: 'white' },
      // A few downwind (easier but smaller)
      { x: 0.80, y: 0.40, resource: 12, color: 'blue' },
      { x: 0.82, y: 0.60, resource: 10, color: 'green' },
    ],
    obstacles: [],
    wind: { angle: 0, strength: 2.0, gustSpeed: 0.004, gustRange: 0.7 },
  },

  // === MAP 5: Windbreak — WIND + SHELTER MAP ===
  {
    id: 5,
    name: 'Windbreak',
    description: 'The wall blocks the wind. Use its shadow.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [40, 65, 85],
    flowers: [
      // Flowers on the far side of the wall
      { x: 0.75, y: 0.25, resource: 28, color: 'green' },
      { x: 0.78, y: 0.40, resource: 32, color: 'purple' },
      { x: 0.80, y: 0.55, resource: 35, color: 'pink' },
      { x: 0.76, y: 0.70, resource: 28, color: 'green' },
      { x: 0.82, y: 0.85, resource: 30, color: 'white' },
    ],
    obstacles: [
      // Tall wall — acts as windbreak, gap in the middle
      { type: 'rect', x: 0.50, y: 0.0, w: 0.025, h: 0.40 },
      { type: 'rect', x: 0.50, y: 0.55, w: 0.025, h: 0.45 },
    ],
    wind: { angle: 0, strength: 1.6, gustSpeed: 0.005, gustRange: 0.6 },
  },

  // ──────────────────────────────────────────────
  // ACT 4: THE PREDATORS
  // ──────────────────────────────────────────────

  // === MAP 6: The sentinel — single WASP MAP ===
  {
    id: 6,
    name: 'The Sentinel',
    description: 'One wasp patrols the corridor. Time your placement.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [40, 65, 85],
    flowers: [
      // Rich garden behind the wasp's patrol line
      { x: 0.80, y: 0.25, resource: 35, color: 'green' },
      { x: 0.82, y: 0.40, resource: 30, color: 'purple' },
      { x: 0.78, y: 0.55, resource: 32, color: 'pink' },
      { x: 0.84, y: 0.65, resource: 28, color: 'white' },
      { x: 0.80, y: 0.78, resource: 30, color: 'blue' },
    ],
    obstacles: [],
    enemies: [
      // Single wasp — long vertical patrol
      { type: 'wasp', patrol: [{ x: 0.55, y: 0.10 }, { x: 0.55, y: 0.90 }], speed: 1.2, killRadius: 30 },
    ],
    wind: { angle: Math.PI * 1.2, strength: 0.2, gustSpeed: 0.0015, gustRange: 0.2 },
  },

  // === MAP 7: Kill zone — MORTALITY MAP ===
  {
    id: 7,
    name: 'Kill Zone',
    description: 'Three wasps. Your bees will not all return.',
    hivesAllowed: 1,
    beeCount: 250,
    simDuration: 60,
    starThresholds: [30, 50, 72],
    flowers: [
      // High-value targets behind enemy lines
      { x: 0.85, y: 0.20, resource: 40, color: 'green' },
      { x: 0.88, y: 0.50, resource: 45, color: 'purple' },
      { x: 0.82, y: 0.75, resource: 40, color: 'pink' },
    ],
    obstacles: [],
    enemies: [
      // Three wasps in staggered horizontal patrols
      { type: 'wasp', patrol: [{ x: 0.35, y: 0.22 }, { x: 0.72, y: 0.22 }], speed: 1.5, killRadius: 28 },
      { type: 'wasp', patrol: [{ x: 0.72, y: 0.50 }, { x: 0.35, y: 0.50 }], speed: 1.3, killRadius: 28 },
      { type: 'wasp', patrol: [{ x: 0.35, y: 0.78 }, { x: 0.72, y: 0.78 }], speed: 1.5, killRadius: 28 },
    ],
    mortality: true,
    wind: { angle: Math.PI * 0.3, strength: 0.3, gustSpeed: 0.002, gustRange: 0.25 },
  },

  // ──────────────────────────────────────────────
  // ACT 5: THE STORM
  // ──────────────────────────────────────────────

  // === MAP 8: Storm Garden — EVERYTHING ===
  {
    id: 8,
    name: 'The Storm',
    description: 'Wind. Wasps. Water. Survive and harvest.',
    hivesAllowed: 2,
    beeCount: 300,
    simDuration: 65,
    starThresholds: [25, 45, 70],
    flowers: [
      // Scattered — forces tough decisions about which to pursue
      { x: 0.10, y: 0.15, resource: 22, color: 'green' },
      { x: 0.88, y: 0.18, resource: 35, color: 'purple' },
      { x: 0.50, y: 0.10, resource: 20, color: 'pink' },
      { x: 0.90, y: 0.50, resource: 38, color: 'blue' },
      { x: 0.12, y: 0.80, resource: 25, color: 'white' },
      { x: 0.78, y: 0.82, resource: 30, color: 'green' },
      { x: 0.50, y: 0.88, resource: 18, color: 'purple' },
      { x: 0.32, y: 0.45, resource: 20, color: 'pink' },
    ],
    obstacles: [
      // Two walls — create shelter pockets
      { type: 'rect', x: 0.42, y: 0.25, w: 0.025, h: 0.22 },
      { type: 'rect', x: 0.58, y: 0.55, w: 0.025, h: 0.22 },
    ],
    zones: [
      // The lake
      { type: 'no-hive', shape: 'circle', x: 0.50, y: 0.42, r: 0.07, visual: 'water' },
      // Mud slows bees in the south
      { type: 'slow', shape: 'rect', x: 0.30, y: 0.72, w: 0.35, h: 0.10, visual: 'mud', speedMult: 0.4 },
    ],
    wind: { angle: Math.PI * 0.75, strength: 1.8, gustSpeed: 0.006, gustRange: 0.7 },
    enemies: [
      { type: 'wasp', patrol: [{ x: 0.25, y: 0.20 }, { x: 0.70, y: 0.30 }], speed: 1.3, killRadius: 25 },
      { type: 'wasp', patrol: [{ x: 0.65, y: 0.60 }, { x: 0.65, y: 0.88 }], speed: 1.1, killRadius: 25 },
    ],
    mortality: true,
  },
];

// Helper: check if point is inside a resolved zone
function isInsideZone(x, y, zone) {
  if (zone.shape === 'rect') {
    return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
  } else if (zone.shape === 'circle') {
    const dx = x - zone.x;
    const dy = y - zone.y;
    return dx * dx + dy * dy <= zone.r * zone.r;
  }
  return false;
}

// Resolve a map definition to pixel coordinates
function loadMap(mapIndex, canvasWidth, canvasHeight, pheromoneGrid) {
  const def = mapIndex === -1 ? null : MAPS[mapIndex];
  if (!def && mapIndex !== -1) return null;

  // Freeplay
  if (mapIndex === -1) {
    return generateFreeplayMap(Date.now(), canvasWidth, canvasHeight, pheromoneGrid);
  }

  const map = {
    id: def.id,
    name: def.name,
    description: def.description,
    hivesAllowed: def.hivesAllowed,
    beeCount: def.beeCount,
    simDuration: def.simDuration,
    starThresholds: def.starThresholds,
    mortality: def.mortality || false,
    flowers: def.flowers.map(f => ({
      x: f.x * canvasWidth,
      y: f.y * canvasHeight,
      resource: f.resource,
      maxResource: f.resource,
      color: f.color,
      displayColor: hslToString(
        FLOWER_COLORS[f.color][0],
        FLOWER_COLORS[f.color][1],
        FLOWER_COLORS[f.color][2],
        1
      ),
      rgbColor: FLOWER_COLORS[f.color],
      radius: 8 + (f.resource / 45) * 7, // 8-15px based on resource amount
      harvestPulse: 0,
    })),
    obstacles: (def.obstacles || []).map(o => {
      if (o.type === 'rect') {
        return {
          type: 'rect',
          x: o.x * canvasWidth,
          y: o.y * canvasHeight,
          w: o.w * canvasWidth,
          h: o.h * canvasHeight,
        };
      } else if (o.type === 'circle') {
        return {
          type: 'circle',
          x: o.x * canvasWidth,
          y: o.y * canvasHeight,
          r: o.r * Math.min(canvasWidth, canvasHeight),
        };
      }
      return o;
    }),
    // Resolve zones
    zones: (def.zones || []).map(z => {
      const resolved = {
        type: z.type,
        shape: z.shape,
        visual: z.visual,
        visualStyle: ZONE_VISUALS[z.visual] || ZONE_VISUALS.water,
      };
      if (z.shape === 'rect') {
        resolved.x = z.x * canvasWidth;
        resolved.y = z.y * canvasHeight;
        resolved.w = z.w * canvasWidth;
        resolved.h = z.h * canvasHeight;
      } else if (z.shape === 'circle') {
        resolved.x = z.x * canvasWidth;
        resolved.y = z.y * canvasHeight;
        resolved.r = z.r * Math.min(canvasWidth, canvasHeight);
      }
      if (z.type === 'slow') {
        resolved.speedMult = z.speedMult || 0.5;
      }
      return resolved;
    }),
    // Resolve wind (preserve gust params for audio/visual scaling)
    wind: def.wind ? {
      angle: def.wind.angle,
      strength: def.wind.strength,
      gustSpeed: def.wind.gustSpeed || 0.003,
      gustRange: def.wind.gustRange || 0.5,
    } : null,
    // Enemies are resolved at runtime (need canvas dimensions)
    enemyDefs: def.enemies || [],
  };

  // Compute total available food
  map.maxFood = map.flowers.reduce((sum, f) => sum + f.maxResource, 0);

  // Stamp obstacles into pheromone grid
  if (pheromoneGrid) {
    for (const obs of map.obstacles) {
      if (obs.type === 'rect') {
        pheromoneGrid.markObstacleRect(obs.x, obs.y, obs.w, obs.h);
      } else if (obs.type === 'circle') {
        pheromoneGrid.markObstacleCircle(obs.x, obs.y, obs.r);
      }
    }
    // Stamp slow zones into speed grid
    for (const zone of map.zones) {
      if (zone.type === 'slow') {
        if (zone.shape === 'rect') {
          pheromoneGrid.markSlowRect(zone.x, zone.y, zone.w, zone.h, zone.speedMult);
        } else if (zone.shape === 'circle') {
          pheromoneGrid.markSlowCircle(zone.x, zone.y, zone.r, zone.speedMult);
        }
      }
    }
  }

  return map;
}

// Procedural freeplay map
function generateFreeplayMap(seed, canvasWidth, canvasHeight, pheromoneGrid) {
  const rng = new SeededRandom(seed);
  const margin = 0.08;

  // Generate 12-22 flowers with Poisson-like spacing
  const flowerCount = rng.int(12, 23);
  const flowers = [];
  const colorKeys = Object.keys(FLOWER_COLORS);
  const minDist = 0.08; // minimum distance between flowers (normalized)

  for (let attempt = 0; attempt < flowerCount * 10 && flowers.length < flowerCount; attempt++) {
    const x = rng.range(margin, 1 - margin);
    const y = rng.range(margin, 1 - margin);

    // Check distance from all existing flowers
    let tooClose = false;
    for (const f of flowers) {
      const dx = f.x - x;
      const dy = f.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const colorKey = colorKeys[rng.int(0, colorKeys.length)];
    const resource = rng.int(10, 40);
    flowers.push({
      x: x * canvasWidth,
      y: y * canvasHeight,
      resource,
      maxResource: resource,
      color: colorKey,
      displayColor: hslToString(
        FLOWER_COLORS[colorKey][0],
        FLOWER_COLORS[colorKey][1],
        FLOWER_COLORS[colorKey][2],
        1
      ),
      rgbColor: FLOWER_COLORS[colorKey],
      radius: 8 + (resource / 45) * 7,
      harvestPulse: 0,
    });
  }

  // Generate 0-4 rectangular obstacles
  const obstacleCount = rng.int(0, 5);
  const obstacles = [];
  for (let i = 0; i < obstacleCount; i++) {
    const horizontal = rng.chance(0.5);
    const ox = rng.range(0.15, 0.75);
    const oy = rng.range(0.15, 0.75);
    obstacles.push({
      type: 'rect',
      x: ox * canvasWidth,
      y: oy * canvasHeight,
      w: (horizontal ? rng.range(0.15, 0.35) : 0.02) * canvasWidth,
      h: (horizontal ? 0.02 : rng.range(0.15, 0.35)) * canvasHeight,
    });
  }

  const map = {
    id: -1,
    name: 'Freeplay',
    description: 'Procedurally generated.',
    hivesAllowed: rng.int(1, 3),
    beeCount: 200 + rng.int(0, 100),
    simDuration: 50,
    starThresholds: [50, 75, 90],
    mortality: false,
    flowers,
    obstacles,
    zones: [],
    wind: {
      angle: rng.range(0, Math.PI * 2),
      strength: rng.range(0.15, 0.35),
      gustSpeed: 0.002,
      gustRange: 0.25,
    },
    enemyDefs: [],
  };

  map.maxFood = map.flowers.reduce((sum, f) => sum + f.maxResource, 0);

  if (pheromoneGrid) {
    for (const obs of map.obstacles) {
      if (obs.type === 'rect') {
        pheromoneGrid.markObstacleRect(obs.x, obs.y, obs.w, obs.h);
      }
    }
  }

  return map;
}

function getTotalMapCount() {
  return MAPS.length;
}
