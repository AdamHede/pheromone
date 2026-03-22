// ============================================================
// SWARM — main.js
// Game loop, state machine, input handling, session flow
// ============================================================

// === Constants ===
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const SIM_TICKS_PER_SECOND = 60;
const FIXED_DT = 1000 / SIM_TICKS_PER_SECOND;
const DIFFUSION_RATE = 0.35;       // Increased for 2px cells (compensates for finer grid)
const EVAPORATION_RATE = 0.993;

// === Game Phases ===
const GamePhase = {
  PLACEMENT: 'placement',
  FORAGING: 'foraging',
  SLOWDOWN: 'slowdown',
  RESULTS: 'results',
};

// === Game State ===
let state = {
  phase: GamePhase.PLACEMENT,
  currentMapIndex: 0,
  map: null,
  hives: [],
  bees: [],
  enemies: [],         // Active Wasp instances
  pheromoneGrid: null,
  particles: null,
  simTime: 0,
  simDuration: 0,
  simSpeed: 1,
  totalFood: 0,
  maxFood: 0,
  seed: 0,
  rng: null,
  firstHarvestTime: -1,
  discoveredFlowers: new Set(),
  audioInitialized: false,
  beesLost: 0,         // Mortality tracking
};

let renderer = null;
let audio = null;
let canvas = null;
let lastTime = 0;
let accumulator = 0;
let currentDpr = 1;

function getDevicePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 3);
}

// === DOM elements ===
let elMapTitle, elMapDesc, elHiveCount, elTimerDisplay, elFoodCounter;
let elGoButton, elHintText, elScoreDisplay, elScoreFood, elScoreStars;
let elScoreMetrics, elBtnRetry, elBtnWatch, elBtnNext, elMapSelect;

// === Mobile Detection ===
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// === Canvas Sizing (letterbox to maintain 16:9) ===
function resizeCanvas() {
  const windowW = window.innerWidth;
  const windowH = window.innerHeight;
  const gameAspect = CANVAS_WIDTH / CANVAS_HEIGHT; // 16:9
  const windowAspect = windowW / windowH;

  let cssWidth, cssHeight;
  if (windowAspect > gameAspect) {
    cssHeight = windowH;
    cssWidth = windowH * gameAspect;
  } else {
    cssWidth = windowW;
    cssHeight = windowW / gameAspect;
  }

  const newDpr = getDevicePixelRatio();
  if (newDpr !== currentDpr) {
    currentDpr = newDpr;
    canvas.width = CANVAS_WIDTH * currentDpr;
    canvas.height = CANVAS_HEIGHT * currentDpr;
    if (renderer) {
      renderer.setDpr(currentDpr);
    }
  }

  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.style.position = 'absolute';
  canvas.style.left = ((windowW - cssWidth) / 2) + 'px';
  canvas.style.top = ((windowH - cssHeight) / 2) + 'px';

  const overlay = document.getElementById('ui-overlay');
  if (overlay) {
    overlay.style.width = cssWidth + 'px';
    overlay.style.height = cssHeight + 'px';
    overlay.style.left = canvas.style.left;
    overlay.style.top = canvas.style.top;
  }
}

// === Initialization ===
function init() {
  canvas = document.getElementById('game-canvas');

  currentDpr = getDevicePixelRatio();
  canvas.width = CANVAS_WIDTH * currentDpr;
  canvas.height = CANVAS_HEIGHT * currentDpr;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Get DOM elements
  elMapTitle = document.getElementById('map-title');
  elMapDesc = document.getElementById('map-description');
  elHiveCount = document.getElementById('hive-count');
  elTimerDisplay = document.getElementById('timer-display');
  elFoodCounter = document.getElementById('food-counter');
  elGoButton = document.getElementById('go-button');
  elHintText = document.getElementById('hint-text');
  elScoreDisplay = document.getElementById('score-display');
  elScoreFood = document.getElementById('score-food');
  elScoreStars = document.getElementById('score-stars');
  elScoreMetrics = document.getElementById('score-metrics');
  elBtnRetry = document.getElementById('btn-retry');
  elBtnWatch = document.getElementById('btn-watch');
  elBtnNext = document.getElementById('btn-next');
  elMapSelect = document.getElementById('map-select');

  renderer = new Renderer(canvas, currentDpr);
  audio = new AudioManager();

  setupInput();

  elGoButton.addEventListener('click', startForaging);
  elBtnRetry.addEventListener('click', retryMap);
  elBtnWatch.addEventListener('click', watchAgain);
  elBtnNext.addEventListener('click', nextMap);

  buildMapSelect();
  loadCurrentMap();
  requestAnimationFrame(gameLoop);
}

function buildMapSelect() {
  const total = getTotalMapCount();
  let html = '';
  for (let i = 0; i < total; i++) {
    html += `<button data-map="${i}">${i + 1}</button>`;
  }
  html += `<button data-map="-1">FREE</button>`;
  elMapSelect.innerHTML = html;

  elMapSelect.addEventListener('click', (e) => {
    if (e.target.dataset.map !== undefined) {
      state.currentMapIndex = parseInt(e.target.dataset.map);
      loadCurrentMap();
    }
  });
}

function updateMapSelectHighlight() {
  const buttons = elMapSelect.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.map) === state.currentMapIndex);
  });
}

// === Map Loading ===
function loadCurrentMap() {
  state.phase = GamePhase.PLACEMENT;
  state.hives = [];
  state.bees = [];
  state.enemies = [];
  state.beesLost = 0;
  state.simTime = 0;
  state.simSpeed = 1;
  state.totalFood = 0;
  state.firstHarvestTime = -1;
  state.discoveredFlowers = new Set();
  state.seed = Date.now();
  state.rng = new SeededRandom(state.seed);

  // Create pheromone grid (2px cells for high-resolution trails)
  state.pheromoneGrid = new PheromoneGrid(CANVAS_WIDTH, CANVAS_HEIGHT, 2);

  state.particles = new ParticleSystem(state.rng);
  state.particles.spawnAmbientDust(CANVAS_WIDTH, CANVAS_HEIGHT);

  state.map = loadMap(state.currentMapIndex, CANVAS_WIDTH, CANVAS_HEIGHT, state.pheromoneGrid);
  state.maxFood = state.map.maxFood;
  state.simDuration = state.map.simDuration;

  // Spawn enemy instances from map definitions
  state.enemies = state.map.enemyDefs.map(def => new Wasp(def, CANVAS_WIDTH, CANVAS_HEIGHT));

  state._flowerResourcesBefore = new Float64Array(state.map.flowers.length);

  renderer.initPheromoneCanvas(state.pheromoneGrid);

  // Update UI
  elMapTitle.textContent = state.map.name;
  elMapDesc.textContent = state.map.description;
  updateHiveCount();
  elGoButton.style.display = 'none';
  elHintText.style.display = 'block';
  elHintText.textContent = isTouchDevice ? 'tap to place hive' : 'click to place hive';
  elScoreDisplay.style.display = 'none';
  elScoreDisplay.classList.remove('visible');
  elTimerDisplay.style.display = 'none';
  elFoodCounter.style.display = 'none';
  elMapSelect.style.display = 'flex';
  updateMapSelectHighlight();

  if (audio.initialized) {
    audio.reset();
  }
}

function updateHiveCount() {
  const remaining = state.map.hivesAllowed - state.hives.length;
  if (remaining > 0) {
    elHiveCount.textContent = `HIVES: ${remaining}`;
    elHiveCount.style.display = 'block';
  } else {
    elHiveCount.style.display = 'none';
  }
}

// === Check if point is inside a no-hive zone ===
function isInNoHiveZone(x, y) {
  if (!state.map || !state.map.zones) return false;
  for (const zone of state.map.zones) {
    if (zone.type !== 'no-hive') continue;
    if (isInsideZone(x, y, zone)) return true;
  }
  return false;
}

// === Input ===
let touchStartTime = 0;
let touchStartPos = { x: 0, y: 0 };
let longPressTimer = null;
const LONG_PRESS_MS = 500;
const TAP_MOVE_THRESHOLD = 15;

function setupInput() {
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', onCanvasRightClick);
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mouseleave', () => renderer.setCursor(0, 0, false));

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.phase === GamePhase.PLACEMENT && state.hives.length === state.map.hivesAllowed) {
        startForaging();
      }
    }
  });

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });
}

function getTouchCanvasCoords(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
    y: (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
  };
}

function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 0) return;
  const touch = e.touches[0];
  const { x, y } = getTouchCanvasCoords(touch);

  touchStartTime = Date.now();
  touchStartPos = { x, y };

  if (state.phase === GamePhase.PLACEMENT) {
    renderer.setCursor(x, y, true);
  }

  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    if (state.phase === GamePhase.PLACEMENT) {
      let nearestIdx = -1;
      let nearestDist = 50;
      for (let i = 0; i < state.hives.length; i++) {
        const d = vecDist(touchStartPos, state.hives[i]);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      if (nearestIdx >= 0) {
        state.hives.splice(nearestIdx, 1);
        updateHiveCount();
        elGoButton.style.display = 'none';
        elHintText.style.display = 'block';
        elHintText.textContent = 'tap to place hive';
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 0) return;
  const touch = e.touches[0];
  const { x, y } = getTouchCanvasCoords(touch);

  if (longPressTimer) {
    const dx = x - touchStartPos.x;
    const dy = y - touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  if (state.phase === GamePhase.PLACEMENT) {
    renderer.setCursor(x, y, true);
  }
}

function onTouchEnd(e) {
  e.preventDefault();

  if (longPressTimer === null && (Date.now() - touchStartTime) >= LONG_PRESS_MS) {
    renderer.setCursor(0, 0, false);
    return;
  }

  clearTimeout(longPressTimer);
  longPressTimer = null;

  const elapsed = Date.now() - touchStartTime;
  if (elapsed < LONG_PRESS_MS) {
    handlePlacement(touchStartPos.x, touchStartPos.y);
  }

  renderer.setCursor(0, 0, false);
}

function onTouchCancel(e) {
  e.preventDefault();
  clearTimeout(longPressTimer);
  longPressTimer = null;
  renderer.setCursor(0, 0, false);
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
    y: (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
  };
}

function onCanvasClick(e) {
  const { x, y } = getCanvasCoords(e);
  handlePlacement(x, y);
}

function onCanvasRightClick(e) {
  e.preventDefault();
  if (state.phase !== GamePhase.PLACEMENT) return;
  const { x, y } = getCanvasCoords(e);

  let nearestIdx = -1;
  let nearestDist = 40;
  for (let i = 0; i < state.hives.length; i++) {
    const d = vecDist({ x, y }, state.hives[i]);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }
  if (nearestIdx >= 0) {
    state.hives.splice(nearestIdx, 1);
    updateHiveCount();
    elGoButton.style.display = 'none';
    elHintText.style.display = 'block';
    elHintText.textContent = 'click to place hive';
  }
}

function onCanvasMouseMove(e) {
  const { x, y } = getCanvasCoords(e);
  renderer.setCursor(x, y, state.phase === GamePhase.PLACEMENT);
}

function handlePlacement(x, y) {
  if (state.phase !== GamePhase.PLACEMENT) return;

  // Check if clicking on existing hive (remove it)
  const removeDist = isTouchDevice ? 35 : 25;
  for (let i = 0; i < state.hives.length; i++) {
    if (vecDist({ x, y }, state.hives[i]) < removeDist) {
      state.hives.splice(i, 1);
      updateHiveCount();
      elGoButton.style.display = 'none';
      elHintText.style.display = 'block';
      elHintText.textContent = isTouchDevice ? 'tap to place hive' : 'click to place hive';
      return;
    }
  }

  if (state.hives.length >= state.map.hivesAllowed) return;
  if (!state.pheromoneGrid.isPassable(x, y)) return;

  // Check not in no-hive zone
  if (isInNoHiveZone(x, y)) return;

  state.hives.push({
    x, y,
    foodCollected: 0,
    flashTimer: 0,
    justDelivered: false,
    pulseT: 0,
  });

  state.particles.spawnHivePulse(x, y);
  updateHiveCount();

  if (state.hives.length === state.map.hivesAllowed) {
    elGoButton.style.display = 'block';
    elHintText.textContent = isTouchDevice ? 'tap GO to start' : 'press GO or SPACE';
  }
}

// === Start Foraging ===
function startForaging() {
  if (state.phase !== GamePhase.PLACEMENT) return;
  if (state.hives.length < state.map.hivesAllowed) return;

  state.phase = GamePhase.FORAGING;
  state.simTime = 0;
  state.beesLost = 0;
  accumulator = 0;

  if (!audio.initialized) {
    audio.init();
  } else {
    audio.reset();
  }

  elGoButton.style.display = 'none';
  elHintText.style.display = 'none';
  elMapSelect.style.display = 'none';
  elTimerDisplay.style.display = 'block';
  elFoodCounter.style.display = 'block';
  renderer.setCursor(0, 0, false);

  // Spawn bees
  state.bees = [];
  const beesPerHive = Math.floor(state.map.beeCount / state.hives.length);
  for (const hive of state.hives) {
    state.particles.spawnBeeEruption(hive.x, hive.y);
    for (let i = 0; i < beesPerHive; i++) {
      const bee = new Bee(hive, state.rng);
      bee.spawnDelay = Math.floor(i * 1.5);
      state.bees.push(bee);
    }
  }

  // Reset enemies to starting positions
  state.enemies = state.map.enemyDefs.map(def => new Wasp(def, CANVAS_WIDTH, CANVAS_HEIGHT));
}

// === Simulation Tick ===
function simulationTick() {
  state.simTime++;

  const simDurationTicks = state.simDuration * SIM_TICKS_PER_SECOND;
  if (state.simTime >= simDurationTicks && state.phase === GamePhase.FORAGING) {
    state.phase = GamePhase.SLOWDOWN;
    audio.fadeOut(4);
  }

  if (state.phase === GamePhase.SLOWDOWN) {
    state.simSpeed *= 0.995;
    if (state.simSpeed < 0.03) {
      showResults();
      return;
    }
  }

  state.pheromoneGrid.update(DIFFUSION_RATE, EVAPORATION_RATE);

  const frb = state._flowerResourcesBefore;
  for (let i = 0; i < state.map.flowers.length; i++) {
    frb[i] = state.map.flowers[i].resource;
  }

  const wind = state.map.wind;
  const bounds = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

  // Update bees
  for (const bee of state.bees) {
    if (bee.dead) continue;
    const wasBeeSearching = bee.state === BeeState.SEARCHING;
    bee.update(state.pheromoneGrid, state.map.flowers, state.map.obstacles, bounds, wind);

    if (wasBeeSearching && bee.state === BeeState.HARVESTING && bee.targetFlower) {
      const flower = bee.targetFlower;
      const flowerIdx = state.map.flowers.indexOf(flower);
      if (!state.discoveredFlowers.has(flowerIdx)) {
        state.discoveredFlowers.add(flowerIdx);
        const dist = vecDist(bee.hive, flower);
        audio.playDiscoveryChime(dist, Math.max(CANVAS_WIDTH, CANVAS_HEIGHT));
        if (state.firstHarvestTime < 0) {
          state.firstHarvestTime = state.simTime;
        }
      }
    }

    if (bee.hive.justDelivered) {
      bee.hive.justDelivered = false;
      bee.hive.pulseT = 1.0;
      state.particles.spawnDeliverySparkle(bee.hive.x, bee.hive.y);
      audio.playDeliveryTick();
    }
  }

  // Update enemies and check kills
  for (const enemy of state.enemies) {
    enemy.update();

    for (const bee of state.bees) {
      if (bee.dead || !bee.active) continue;
      if (enemy.canKill(bee)) {
        bee.kill();
        state.beesLost++;
        state.particles.spawnDeathBurst(bee.x, bee.y);
        audio.playBeeKilled();
      }
    }
  }

  // Check for flower depletion events
  for (let i = 0; i < state.map.flowers.length; i++) {
    const flower = state.map.flowers[i];
    if (frb[i] > 0 && flower.resource <= 0) {
      const rgb = hslToRgb(
        flower.rgbColor[0] / 360,
        flower.rgbColor[1] / 100,
        flower.rgbColor[2] / 100
      );
      state.particles.spawnPollenBurst(
        flower.x, flower.y,
        [Math.floor(rgb[0] * 255), Math.floor(rgb[1] * 255), Math.floor(rgb[2] * 255)]
      );
      audio.playFlowerDepleted();
    }
  }

  state.particles.update();

  for (const hive of state.hives) {
    if (hive.pulseT > 0) {
      hive.pulseT *= 0.9;
      if (hive.pulseT < 0.01) hive.pulseT = 0;
    }
  }

  // Update death timers for animation
  for (const bee of state.bees) {
    if (bee.dead && bee.deathTimer > 0) {
      bee.deathTimer--;
    }
  }

  state.totalFood = state.hives.reduce((sum, h) => sum + h.foodCollected, 0);
}

// === Results ===
function showResults() {
  state.phase = GamePhase.RESULTS;

  const percent = state.maxFood > 0 ? (state.totalFood / state.maxFood) * 100 : 0;
  const thresholds = state.map.starThresholds;
  let stars = 0;
  if (percent >= thresholds[0]) stars = 1;
  if (percent >= thresholds[1]) stars = 2;
  if (percent >= thresholds[2]) stars = 3;

  const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);

  const simSeconds = state.simTime / SIM_TICKS_PER_SECOND;
  const activeBeeFrames = state.bees.length * simSeconds;
  const efficiency = activeBeeFrames > 0 ? (state.totalFood / activeBeeFrames * 100).toFixed(1) : '0';
  const coverage = state.maxFood > 0 ? Math.round((state.discoveredFlowers.size / state.map.flowers.length) * 100) : 0;
  const speedToFirst = state.firstHarvestTime >= 0
    ? (state.firstHarvestTime / SIM_TICKS_PER_SECOND).toFixed(1) + 's'
    : '-';

  elScoreFood.textContent = `${state.totalFood} / ${state.maxFood}`;
  elScoreStars.textContent = starStr;

  let metricsHtml =
    `EFFICIENCY ${efficiency}<br>` +
    `COVERAGE ${coverage}%<br>` +
    `FIRST HARVEST ${speedToFirst}`;

  if (state.beesLost > 0) {
    const totalBees = state.bees.length;
    metricsHtml += `<br>BEES LOST ${state.beesLost} / ${totalBees}`;
  }

  elScoreMetrics.innerHTML = metricsHtml;

  elScoreDisplay.style.display = 'block';
  requestAnimationFrame(() => {
    elScoreDisplay.classList.add('visible');
  });

  const isLast = state.currentMapIndex >= getTotalMapCount() - 1;
  elBtnNext.style.display = isLast ? 'none' : '';
}

function retryMap() {
  loadCurrentMap();
}

function watchAgain() {
  const savedHives = state.hives.map(h => ({ x: h.x, y: h.y }));
  const savedSeed = state.seed;

  state.pheromoneGrid.reset();
  state.pheromoneGrid.passable.fill(1);
  state.pheromoneGrid.speedMult.fill(1.0);
  for (const obs of state.map.obstacles) {
    if (obs.type === 'rect') {
      state.pheromoneGrid.markObstacleRect(obs.x, obs.y, obs.w, obs.h);
    } else if (obs.type === 'circle') {
      state.pheromoneGrid.markObstacleCircle(obs.x, obs.y, obs.r);
    }
  }
  for (const zone of state.map.zones) {
    if (zone.type === 'slow') {
      if (zone.shape === 'rect') {
        state.pheromoneGrid.markSlowRect(zone.x, zone.y, zone.w, zone.h, zone.speedMult);
      } else if (zone.shape === 'circle') {
        state.pheromoneGrid.markSlowCircle(zone.x, zone.y, zone.r, zone.speedMult);
      }
    }
  }

  for (const f of state.map.flowers) {
    f.resource = f.maxResource;
    f.harvestPulse = 0;
  }

  state._flowerResourcesBefore = new Float64Array(state.map.flowers.length);

  state.hives = savedHives.map(h => ({
    x: h.x, y: h.y,
    foodCollected: 0,
    flashTimer: 0,
    justDelivered: false,
    pulseT: 0,
  }));

  state.totalFood = 0;
  state.beesLost = 0;
  state.firstHarvestTime = -1;
  state.discoveredFlowers = new Set();
  state.simTime = 0;
  state.simSpeed = 2.0;
  accumulator = 0;

  state.rng = new SeededRandom(savedSeed);

  state.particles = new ParticleSystem(state.rng);
  state.particles.spawnAmbientDust(CANVAS_WIDTH, CANVAS_HEIGHT);

  if (audio.initialized) {
    audio.reset();
  }

  // Reset enemies
  state.enemies = state.map.enemyDefs.map(def => new Wasp(def, CANVAS_WIDTH, CANVAS_HEIGHT));

  state.bees = [];
  const beesPerHive = Math.floor(state.map.beeCount / state.hives.length);
  for (const hive of state.hives) {
    state.particles.spawnBeeEruption(hive.x, hive.y);
    for (let i = 0; i < beesPerHive; i++) {
      const bee = new Bee(hive, state.rng);
      bee.spawnDelay = Math.floor(i * 1.5);
      state.bees.push(bee);
    }
  }

  elScoreDisplay.style.display = 'none';
  elScoreDisplay.classList.remove('visible');
  elTimerDisplay.style.display = 'block';
  elFoodCounter.style.display = 'block';

  state.phase = GamePhase.FORAGING;
}

function nextMap() {
  if (state.currentMapIndex < getTotalMapCount() - 1) {
    state.currentMapIndex++;
  } else {
    state.currentMapIndex = -1;
  }
  loadCurrentMap();
}

// === Game Loop ===
function gameLoop(timestamp) {
  if (lastTime === 0) lastTime = timestamp;
  const dt = Math.min(timestamp - lastTime, 100);
  lastTime = timestamp;

  if (state.phase === GamePhase.FORAGING || state.phase === GamePhase.SLOWDOWN) {
    accumulator += dt * state.simSpeed;
    let ticksThisFrame = 0;
    const maxTicksPerFrame = 4;
    while (accumulator >= FIXED_DT && ticksThisFrame < maxTicksPerFrame) {
      simulationTick();
      accumulator -= FIXED_DT;
      ticksThisFrame++;
      if (state.phase === GamePhase.RESULTS) break;
    }
    if (ticksThisFrame >= maxTicksPerFrame) {
      accumulator = 0;
    }
  }

  if (state.phase === GamePhase.FORAGING || state.phase === GamePhase.SLOWDOWN) {
    const remaining = Math.max(0, state.simDuration - state.simTime / SIM_TICKS_PER_SECOND);
    elTimerDisplay.textContent = `${Math.ceil(remaining)}s`;
    elFoodCounter.textContent = `FOOD: ${state.totalFood}`;

    let activeBees = 0;
    for (let i = 0; i < state.bees.length; i++) {
      if (state.bees[i].active) activeBees++;
    }
    const swarmCenter = computeSwarmCenter(state.bees);
    audio.update(
      state.pheromoneGrid.getTotalIntensity(),
      state.pheromoneGrid.getRecruitmentIntensity(),
      activeBees,
      swarmCenter.x,
      CANVAS_WIDTH,
      state.map.beeCount
    );
  }

  renderer.render(state, timestamp);
  requestAnimationFrame(gameLoop);
}

function computeSwarmCenter(bees) {
  let sx = 0, sy = 0, count = 0;
  for (const bee of bees) {
    if (!bee.active) continue;
    sx += bee.x;
    sy += bee.y;
    count++;
  }
  if (count === 0) return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  return { x: sx / count, y: sy / count };
}

function isInsideObstacle(x, y, obstacles) {
  for (const obs of obstacles) {
    if (obs.type === 'rect') {
      if (x >= obs.x && x <= obs.x + obs.w && y >= obs.y && y <= obs.y + obs.h) {
        return true;
      }
    } else if (obs.type === 'circle') {
      const dx = x - obs.x;
      const dy = y - obs.y;
      if (dx * dx + dy * dy <= obs.r * obs.r) return true;
    }
  }
  return false;
}

window.addEventListener('DOMContentLoaded', init);
