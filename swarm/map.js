// ============================================================
// SWARM — map.js
// Map definitions, loading, and procedural generation
// ============================================================

// Flower color palette (soft, distinct from pheromone colors)
const FLOWER_COLORS = {
  green:  [140, 60, 55],  // [h, s%, l%]
  purple: [280, 50, 60],
  pink:   [330, 55, 60],
  blue:   [210, 50, 55],
  white:  [60, 20, 75],
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
  // === MAP 1: Tutorial — can't lose ===
  {
    id: 1,
    name: 'First Flight',
    description: 'Place your hive and watch the bees find food.',
    hivesAllowed: 1,
    beeCount: 150,
    simDuration: 45,
    starThresholds: [20, 35, 50], // Very easy — can't lose
    flowers: [
      { x: 0.55, y: 0.42, resource: 30, color: 'green' },
      { x: 0.52, y: 0.48, resource: 25, color: 'purple' },
      { x: 0.58, y: 0.50, resource: 28, color: 'pink' },
      { x: 0.54, y: 0.55, resource: 22, color: 'green' },
      { x: 0.57, y: 0.45, resource: 26, color: 'white' },
    ],
    obstacles: [],
  },

  // === MAP 2: Fork — two clusters ===
  {
    id: 2,
    name: 'Fork',
    description: 'Two clusters. Watch the swarm split.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 50,
    starThresholds: [50, 75, 90],
    flowers: [
      // Upper-right cluster
      { x: 0.78, y: 0.22, resource: 25, color: 'purple' },
      { x: 0.82, y: 0.25, resource: 30, color: 'green' },
      { x: 0.80, y: 0.18, resource: 22, color: 'pink' },
      { x: 0.76, y: 0.26, resource: 28, color: 'white' },
      // Lower-right cluster
      { x: 0.78, y: 0.75, resource: 25, color: 'green' },
      { x: 0.82, y: 0.72, resource: 30, color: 'purple' },
      { x: 0.80, y: 0.78, resource: 22, color: 'blue' },
      { x: 0.76, y: 0.70, resource: 28, color: 'pink' },
    ],
    obstacles: [],
  },

  // === MAP 3: Still Waters — introduces NO-HIVE ZONES ===
  {
    id: 3,
    name: 'Still Waters',
    description: 'Water blocks the obvious path. Place around it.',
    hivesAllowed: 1,
    beeCount: 180,
    simDuration: 50,
    starThresholds: [45, 70, 88],
    flowers: [
      { x: 0.75, y: 0.35, resource: 28, color: 'green' },
      { x: 0.78, y: 0.42, resource: 30, color: 'purple' },
      { x: 0.72, y: 0.50, resource: 25, color: 'pink' },
      { x: 0.76, y: 0.58, resource: 28, color: 'white' },
      { x: 0.80, y: 0.65, resource: 32, color: 'blue' },
    ],
    obstacles: [],
    zones: [
      // Large water zone blocking the center — forces hive to the sides
      { type: 'no-hive', shape: 'rect', x: 0.25, y: 0.20, w: 0.30, h: 0.55, visual: 'water' },
    ],
  },

  // === MAP 4: Headwind — introduces WIND ===
  {
    id: 4,
    name: 'Headwind',
    description: 'Wind blows east. Place wisely.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [45, 68, 85],
    flowers: [
      { x: 0.18, y: 0.35, resource: 30, color: 'green' },
      { x: 0.15, y: 0.45, resource: 28, color: 'purple' },
      { x: 0.20, y: 0.55, resource: 32, color: 'pink' },
      { x: 0.12, y: 0.50, resource: 25, color: 'white' },
      { x: 0.22, y: 0.42, resource: 28, color: 'blue' },
    ],
    obstacles: [],
    wind: { angle: 0, strength: 0.5 }, // Blows right (east)
  },

  // === MAP 5: The Wall — obstacles + wind ===
  {
    id: 5,
    name: 'The Wall',
    description: 'A barrier and crosswind. Find the gap.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [40, 65, 85],
    flowers: [
      { x: 0.75, y: 0.30, resource: 30, color: 'green' },
      { x: 0.78, y: 0.35, resource: 28, color: 'purple' },
      { x: 0.80, y: 0.50, resource: 35, color: 'pink' },
      { x: 0.76, y: 0.65, resource: 28, color: 'green' },
      { x: 0.82, y: 0.60, resource: 32, color: 'white' },
    ],
    obstacles: [
      // Vertical wall with gap
      { type: 'rect', x: 0.54, y: 0.0, w: 0.02, h: 0.36 },
      { type: 'rect', x: 0.54, y: 0.48, w: 0.02, h: 0.52 },
    ],
    wind: { angle: Math.PI * 0.5, strength: 0.3 }, // Blows south (down)
  },

  // === MAP 6: Patrol — introduces ENEMIES ===
  {
    id: 6,
    name: 'Patrol',
    description: 'Wasps guard the flowers. Plan your route.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [40, 65, 85],
    flowers: [
      { x: 0.78, y: 0.30, resource: 30, color: 'green' },
      { x: 0.82, y: 0.38, resource: 32, color: 'purple' },
      { x: 0.75, y: 0.50, resource: 28, color: 'pink' },
      { x: 0.80, y: 0.60, resource: 30, color: 'white' },
      { x: 0.77, y: 0.70, resource: 25, color: 'blue' },
    ],
    obstacles: [],
    enemies: [
      // Single wasp patrolling vertically between hive area and flowers
      { type: 'wasp', patrol: [{ x: 0.55, y: 0.20 }, { x: 0.55, y: 0.80 }], speed: 1.2, killRadius: 30 },
    ],
  },

  // === MAP 7: Gauntlet — enemies + MORTALITY ===
  {
    id: 7,
    name: 'Gauntlet',
    description: 'Multiple wasps. Every bee counts.',
    hivesAllowed: 1,
    beeCount: 250,
    simDuration: 60,
    starThresholds: [35, 55, 78],
    flowers: [
      { x: 0.82, y: 0.25, resource: 35, color: 'green' },
      { x: 0.85, y: 0.45, resource: 40, color: 'purple' },
      { x: 0.80, y: 0.65, resource: 35, color: 'pink' },
      { x: 0.88, y: 0.55, resource: 30, color: 'white' },
    ],
    obstacles: [],
    enemies: [
      // Three wasps patrolling at different heights
      { type: 'wasp', patrol: [{ x: 0.40, y: 0.20 }, { x: 0.70, y: 0.20 }], speed: 1.5, killRadius: 25 },
      { type: 'wasp', patrol: [{ x: 0.70, y: 0.50 }, { x: 0.40, y: 0.50 }], speed: 1.3, killRadius: 25 },
      { type: 'wasp', patrol: [{ x: 0.40, y: 0.80 }, { x: 0.70, y: 0.80 }], speed: 1.5, killRadius: 25 },
    ],
    mortality: true, // Bees die permanently when killed
  },

  // === MAP 8: Storm Garden — ALL MECHANICS ===
  {
    id: 8,
    name: 'Storm Garden',
    description: 'Wind, wasps, water, and will. The final test.',
    hivesAllowed: 2,
    beeCount: 300,
    simDuration: 65,
    starThresholds: [30, 50, 75],
    flowers: [
      // Scattered across the map
      { x: 0.12, y: 0.15, resource: 20, color: 'green' },
      { x: 0.85, y: 0.20, resource: 30, color: 'purple' },
      { x: 0.50, y: 0.12, resource: 22, color: 'pink' },
      { x: 0.88, y: 0.50, resource: 35, color: 'blue' },
      { x: 0.15, y: 0.75, resource: 25, color: 'white' },
      { x: 0.75, y: 0.80, resource: 28, color: 'green' },
      { x: 0.50, y: 0.85, resource: 20, color: 'purple' },
      { x: 0.30, y: 0.40, resource: 18, color: 'pink' },
    ],
    obstacles: [
      // A few walls to funnel movement
      { type: 'rect', x: 0.45, y: 0.30, w: 0.02, h: 0.25 },
    ],
    zones: [
      // Water in upper-center
      { type: 'no-hive', shape: 'circle', x: 0.50, y: 0.35, r: 0.08, visual: 'water' },
      // Mud slow zone in lower area
      { type: 'slow', shape: 'rect', x: 0.35, y: 0.70, w: 0.30, h: 0.12, visual: 'mud', speedMult: 0.4 },
    ],
    wind: { angle: Math.PI * 0.75, strength: 0.4 }, // Blows south-west
    enemies: [
      { type: 'wasp', patrol: [{ x: 0.30, y: 0.25 }, { x: 0.70, y: 0.25 }], speed: 1.3, killRadius: 25 },
      { type: 'wasp', patrol: [{ x: 0.60, y: 0.55 }, { x: 0.60, y: 0.85 }], speed: 1.1, killRadius: 25 },
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
    // Resolve wind
    wind: def.wind ? { angle: def.wind.angle, strength: def.wind.strength } : null,
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
    wind: null,
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
