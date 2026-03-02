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

// All positions in normalized [0-1] coordinates
const MAPS = [
  {
    id: 1,
    name: 'First Flight',
    description: 'Place your hive and watch the bees find food.',
    hivesAllowed: 1,
    beeCount: 150,
    simDuration: 45,
    starThresholds: [50, 75, 90],
    flowers: [
      { x: 0.72, y: 0.45, resource: 30, color: 'green' },
      { x: 0.68, y: 0.50, resource: 25, color: 'purple' },
      { x: 0.75, y: 0.52, resource: 28, color: 'pink' },
      { x: 0.70, y: 0.55, resource: 22, color: 'green' },
      { x: 0.74, y: 0.48, resource: 26, color: 'white' },
    ],
    obstacles: [],
  },
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
  {
    id: 3,
    name: 'The Wall',
    description: 'A barrier stands between you and the food.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 55,
    starThresholds: [45, 70, 88],
    flowers: [
      { x: 0.75, y: 0.30, resource: 30, color: 'green' },
      { x: 0.78, y: 0.35, resource: 28, color: 'purple' },
      { x: 0.80, y: 0.50, resource: 35, color: 'pink' },
      { x: 0.76, y: 0.65, resource: 28, color: 'green' },
      { x: 0.82, y: 0.60, resource: 32, color: 'white' },
    ],
    obstacles: [
      // Vertical wall at 55% x, with gap at 38-45% y
      { type: 'rect', x: 0.54, y: 0.0, w: 0.02, h: 0.36 },
      { type: 'rect', x: 0.54, y: 0.48, w: 0.02, h: 0.52 },
    ],
  },
  {
    id: 4,
    name: 'Garden',
    description: 'Scattered flowers. Place two hives wisely.',
    hivesAllowed: 2,
    beeCount: 250,
    simDuration: 55,
    starThresholds: [50, 72, 88],
    flowers: [
      { x: 0.15, y: 0.15, resource: 15, color: 'green' },
      { x: 0.30, y: 0.20, resource: 12, color: 'purple' },
      { x: 0.50, y: 0.12, resource: 18, color: 'pink' },
      { x: 0.75, y: 0.18, resource: 14, color: 'blue' },
      { x: 0.88, y: 0.25, resource: 16, color: 'green' },
      { x: 0.10, y: 0.50, resource: 15, color: 'white' },
      { x: 0.35, y: 0.55, resource: 18, color: 'purple' },
      { x: 0.60, y: 0.48, resource: 12, color: 'green' },
      { x: 0.85, y: 0.52, resource: 20, color: 'pink' },
      { x: 0.20, y: 0.80, resource: 16, color: 'blue' },
      { x: 0.45, y: 0.85, resource: 14, color: 'green' },
      { x: 0.65, y: 0.78, resource: 18, color: 'purple' },
      { x: 0.80, y: 0.82, resource: 15, color: 'white' },
      { x: 0.92, y: 0.75, resource: 12, color: 'pink' },
      { x: 0.50, y: 0.65, resource: 16, color: 'green' },
    ],
    obstacles: [],
  },
  {
    id: 5,
    name: 'Maze',
    description: 'Navigate the corridors to reach the food.',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 60,
    starThresholds: [40, 65, 85],
    flowers: [
      // Food at dead-end corridors
      { x: 0.90, y: 0.15, resource: 35, color: 'green' },
      { x: 0.90, y: 0.85, resource: 35, color: 'purple' },
      { x: 0.50, y: 0.50, resource: 25, color: 'pink' },
      { x: 0.75, y: 0.50, resource: 30, color: 'white' },
    ],
    obstacles: [
      // Horizontal walls creating corridors
      { type: 'rect', x: 0.20, y: 0.28, w: 0.50, h: 0.02 },
      { type: 'rect', x: 0.35, y: 0.48, w: 0.55, h: 0.02 },
      { type: 'rect', x: 0.20, y: 0.68, w: 0.50, h: 0.02 },
      // Vertical walls creating turns
      { type: 'rect', x: 0.35, y: 0.0, w: 0.02, h: 0.15 },
      { type: 'rect', x: 0.60, y: 0.30, w: 0.02, h: 0.18 },
      { type: 'rect', x: 0.35, y: 0.70, w: 0.02, h: 0.15 },
    ],
    obstacles_note: 'Creates corridors that force interesting path formation',
  },
  {
    id: 6,
    name: 'The Choice',
    description: 'Near and small, or far and rich?',
    hivesAllowed: 1,
    beeCount: 200,
    simDuration: 50,
    starThresholds: [50, 75, 92],
    flowers: [
      // Nearby small cluster (left side, quick payoff)
      { x: 0.30, y: 0.45, resource: 10, color: 'green' },
      { x: 0.32, y: 0.50, resource: 8, color: 'purple' },
      { x: 0.28, y: 0.52, resource: 9, color: 'pink' },
      // Distant rich cluster (far right, high reward)
      { x: 0.85, y: 0.40, resource: 40, color: 'green' },
      { x: 0.88, y: 0.45, resource: 45, color: 'purple' },
      { x: 0.83, y: 0.50, resource: 42, color: 'pink' },
      { x: 0.87, y: 0.55, resource: 38, color: 'white' },
      { x: 0.90, y: 0.48, resource: 40, color: 'blue' },
    ],
    obstacles: [],
  },
];

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
    flowers,
    obstacles,
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
