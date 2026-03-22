# SWARM

### A Pheromone Puzzle — Game Design Document

---

## The Elevator Pitch

**Swarm** is a puzzle game where you place beehives on a map scattered with flowers, then hit "go" and watch hundreds of bees solve the foraging problem through emergent collective intelligence. Bees leave the hive with no plan. They wander. They leave invisible scent trails. When a bee finds food, she returns home along her trail, now laying a *recruitment pheromone* that attracts others. Paths reinforce. Highways form. The map comes alive with luminous, branching rivers of scent — a glowing neural network drawn by instinct. Your job: read the map, place your hives wisely, and watch your swarm paint the darkness with light.

**Think:** A puzzle wrapped in a nature documentary, viewed through a dark field microscope.

---

## Core Fantasy

You're looking down through impossibly magnified glass at a dark landscape. Flowers glow faintly in the void. You place a hive — a warm, pulsing nucleus — and release the swarm. At first, it's chaos: hundreds of tiny bright particles scatter outward in every direction, each one steering its own semi-random course. The map fills with a dim, diffusing haze of exploration pheromone — the bees marking "I've been here."

Then — a bee finds a flower. She turns. Follows her own fading scent trail home, now blazing a new *recruitment trail* behind her. That trail glows brighter. Other bees sense it. Their random walks bend toward it. More bees reach the flower. More return. The trail intensifies — a luminous highway forming in real time, widening, branching at decision points, thickening near the hive and tapering toward the source. Within seconds, your screen has transformed from scattered chaos into a living, breathing vascular system of light.

That transformation — from noise to structure — is the visual and emotional core of the game.

---

## Visual Identity

### The Aesthetic: "Dark Field Stigmergy"

Same visual world as Bloom — dark field microscopy, bioluminescent light in void. But the star is no longer individual organisms. It's the **pheromone field** — a continuously diffusing, evaporating, glowing landscape painted by collective behavior.

Reference points:
- Ant/bee colony simulations by Sebastian Lague, Coding Train
- Bioluminescent plankton blooms in ocean currents
- Long-exposure photography of city traffic at night
- Neural pathway imaging (DTI brain scans, but in color)
- Rivers seen from space at night, lit by cities along their banks

### The Canvas

- Background: `hsl(220, 12%, 3%)` — the living dark
- Subtle animated noise grain (microscope film grain)
- The pheromone field is rendered as a glowing 2D heatmap *on top* of this darkness
- `globalCompositeOperation: 'lighter'` for all pheromone and bee rendering — additive light is essential

### Bees

Small, bright, fast-moving particles. Not detailed insects — abstracted to points of light:
- A bright core (2-3px) with a soft glow halo (8-12px via `shadowBlur`)
- A very faint, short motion trail (2-3 frames of previous positions, fading)
- Color matches their current state:
  - **Searching**: Warm white / pale gold (neutral, exploratory)
  - **Returning with food**: Bright amber / honey gold (carrying treasure, brighter and slightly larger)
  - **Following recruitment trail**: Slightly tinted toward the pheromone color they're following
- Speed: Noticeably fast. Bees move with urgency. Not frantic, but purposeful — clearly faster than the gentle drift of cells in Bloom. They cover ground.
- Movement: Forward-biased with stochastic steering. The *turning radius* (max degrees per frame) is a critical parameter — see Mechanics.

### Pheromone Field

The visual centerpiece. Rendered as a low-resolution grid (each cell ~4-8px) that gets drawn as smooth gradients:

**Two pheromone layers, two colors:**

| Layer | Purpose | Color | Visual Feel |
|---|---|---|---|
| Exploration pheromone | "I've been here" | Cool — soft blue / cyan | Dim, diffuse haze. Like fog. Low information. |
| Recruitment pheromone | "Food this way!" | Warm — amber / gold / coral | Bright, concentrated trails. Like veins of light. |

The contrast between the dim blue exploration cloud and the bright amber recruitment highways is what creates the visual drama. Early in a run, the map is a soft blue haze as bees scatter. Then golden rivers punch through it — sharp, bright, decisive.

**Rendering the pheromone field:**
- Each grid cell stores two float values (exploration concentration, recruitment concentration)
- Render as filled rectangles (or use `putImageData` for performance) with color = blend of both pheromone colors weighted by concentration
- Apply a slight gaussian blur pass (or just rely on the grid cell size + additive blending for natural softness)
- Brightness maps directly to concentration — empty areas are black, saturated trails are vivid

**Diffusion & evaporation** (computed per simulation tick):
- Each cell spreads a fraction of its pheromone to its 8 neighbors (diffusion)
- Each cell loses a fraction of its pheromone per tick (evaporation)
- The balance of these two rates controls the visual character:
  - High diffusion + low evaporation = soft, wide, cloudy trails (dreamy)
  - Low diffusion + high evaporation = sharp, thin, precise trails (nervous, electric)
  - The game should sit in between — trails that are defined but have a luminous bloom around them

### Hives

Warm, pulsing circles:
- Base: solid circle, ~20-30px, warm amber
- Glow: large `shadowBlur` (40-60px), warm tone — the hive is the brightest static object on the map
- Pulse: radius oscillates gently (~0.5Hz), like a heartbeat
- Bees stream out from the center and return to it
- When bees deliver food, the hive briefly brightens (a tiny "thank you" flash)
- Visual metaphor: the hive is a warm sun, and the pheromone trails are its rays reaching toward food

### Flowers (Food Sources)

Soft, small glowing points:
- Each flower is a gentle colored circle (~8-15px) with glow
- Color: distinct from pheromone — soft greens, pale purples, gentle pinks
- They don't compete visually with the pheromone trails — they're *destinations*, not the drama
- Flowers have a finite resource amount. As bees harvest, the flower dims
- Depleted flowers become very dim (not invisible — you can still see where they were)
- Flower glow subtly pulses when being harvested (bees are on it)

### Obstacles / Terrain

Maps can have walls or impassable areas:
- Rendered as very faint geometric shapes — subtle outlines or slight background brightness shifts
- They shouldn't dominate the visual — they're the negative space that forces interesting path formation
- Think: faintly visible rock formations in dark water

### Typography

**Space Mono** (Google Fonts). Same philosophy as Bloom:
- Map name / number (top, small, low opacity)
- Score readout after run completes
- Hive placement count remaining
- "Go" button text (or just an icon)
- All minimal, all whispering

---

## Mechanics

### The Simulation

This is a faithful implementation of pheromone-based foraging. Not a loose metaphor — the real algorithm, because the real algorithm is what produces the beautiful emergent structures.

#### Bee Behavior State Machine

```
SEARCHING (outbound, no food)
├── Movement: Forward-biased random walk
│   - Each frame: heading += random(-maxTurn, +maxTurn)
│   - Slight bias toward unexplored areas (away from own exploration pheromone)
│   - Moderate bias toward recruitment pheromone (sniff and steer)
│   - Bounces off map edges and obstacles
├── Pheromone: Deposits EXPLORATION pheromone at current position
├── Transition → HARVESTING: when bee reaches a flower with remaining resources
│
HARVESTING (on flower)
├── Duration: brief pause (~0.5 seconds visual time)
├── Flower resource decreases
├── Transition → RETURNING: after harvest complete
│
RETURNING (homebound, carrying food)
├── Movement: Follows own EXPLORATION pheromone gradient back toward hive
│   - Steers toward increasing exploration pheromone concentration
│   - This is how the bee "remembers" where home is — its own trail
│   - Some random perturbation still present (doesn't follow perfectly)
├── Pheromone: Deposits RECRUITMENT pheromone (stronger than exploration)
│   - Recruitment pheromone strength can scale with food source quality
├── Transition → DELIVERING: when bee reaches the hive
│
DELIVERING (at hive)
├── Duration: brief (~0.3 seconds)
├── Hive food count increases
├── Score increments
├── Hive flashes
├── Transition → SEARCHING: bee heads out again
```

#### Pheromone Steering (The Key Algorithm)

When a searching bee decides where to steer, she samples pheromone concentration in three directions:
- Left sensor (heading - sensorAngle)
- Center sensor (heading)
- Right sensor (heading + sensorAngle)

Each sensor reads the pheromone value at a point `sensorDistance` ahead in that direction.

```
if (center > left && center > right) → keep heading (go straight)
if (left > right) → steer left
if (right > left) → steer right
if (left == right) → random choice
```

This is how bees "smell" the pheromone and navigate toward it — a local, sensor-based decision that produces global intelligent behavior. The `sensorAngle`, `sensorDistance`, and `maxTurnRate` parameters are absolutely critical for the visual output.

#### Turning Radius — The Beauty Parameter

The maximum turn rate per frame is the single most important visual parameter:

| Max Turn Rate | Visual Result |
|---|---|
| Very low (~5°/frame) | Long, sweeping arcs. Graceful, flowing highways. River-like. Beautiful but slow to explore. |
| Low-medium (~15°/frame) | Organic curves, natural-looking paths. Good balance. The sweet spot. |
| Medium (~30°/frame) | More fractal, tree-like branching. Denser coverage, more chaotic beauty. |
| High (~60°+/frame) | Jittery, space-filling noise. Loses structure. Too chaotic. |

The game should default around **10-20°/frame** for that organic, flowing quality. Different maps could tune this for different visual character.

#### Pheromone Grid

```
Resolution: canvas divided into cells of ~4-6px each
Each cell stores:
  - explorationPheromone: float (0.0 → 1.0+)
  - recruitmentPheromone: float (0.0 → 1.0+)

Per simulation tick:
  1. DEPOSIT: Each bee adds pheromone to its current grid cell
  2. DIFFUSE: Each cell shares a fraction (e.g., 0.2) equally to its 8 neighbors
     (Use double-buffer: read from old grid, write to new grid, swap)
  3. EVAPORATE: Each cell multiplied by decay factor (e.g., 0.995 per tick)
     Lower = faster evaporation = sharper trails
     Higher = slower evaporation = softer, longer-lasting trails
```

Performance note: the pheromone grid update is the computational bottleneck. For a 300x200 grid (60,000 cells), updating twice per frame is feasible. Could also run simulation ticks at a fixed rate independent of render framerate.

### The Puzzle Layer

Each map is a hand-designed arrangement of:
- **Flower positions** (and resource amounts — some flowers are richer than others)
- **Obstacle positions** (walls, barriers — force bees through interesting channels)
- **Map size and shape** (some maps are open, others are mazes)

The player's decisions:
1. **Where to place 1-3 hives** (number depends on the map)
2. **When to hit "Go"** (no time pressure — study the map first)

That's it. Minimal input, maximum emergent complexity.

#### What makes a good placement?

- **Distance matters**: Bees travel outward and back. Closer hives collect faster, but might miss distant rich flowers.
- **Obstacle navigation**: Placing a hive on the wrong side of a wall means bees must find long detours. The pheromone system will *eventually* find a path, but it's inefficient.
- **Coverage**: Multiple hives can cover different map regions, but their foraging zones may overlap (wasted effort) or compete.
- **Choke points**: Some maps have narrow passages. A hive near a choke point can exploit it — or get bottlenecked.

#### Scoring

After a fixed simulation duration (e.g., 60 seconds of sim time, ~45 seconds real time at slight fast-forward):

**Primary: Food Collected** — total flowers harvested across all hives.

**Bonus metrics** (displayed but secondary):
- Efficiency: food per bee-second (rewarding short paths)
- Coverage: percentage of flowers discovered
- Speed: time to first harvest

**Star rating per map:**
- ★ — Collected at least 50% of available food
- ★★ — Collected 75%+
- ★★★ — Collected 90%+ (requires reading the map deeply)

The scoring is soft — stars, not hard pass/fail. The real reward is watching the beautiful trail network emerge from your placement choice.

### Map Progression

Start with simple maps, increase complexity:

```
MAP 1: "First Flight"
  - Open field
  - One flower cluster directly ahead
  - One hive to place
  - Tutorial: shows how pheromone trails form
  
MAP 2: "Fork"
  - Two flower clusters in different directions
  - One hive to place
  - Lesson: watch the swarm split and form two highways
  
MAP 3: "The Wall"
  - A barrier between hive area and food
  - Gap in the wall
  - Lesson: bees find gaps, trails route around obstacles
  
MAP 4: "Garden"
  - Many small flower sources scattered widely
  - Two hives to place
  - Lesson: coverage strategy, overlapping territories
  
MAP 5: "Maze"
  - Complex obstacle layout
  - Food at the end of corridors
  - Lesson: pheromone pathfinding through complex terrain
  
MAP 6: "The Choice"
  - One nearby small food source, one distant rich source
  - Lesson: early exploitation vs long-term payoff
  
MAP 7-12: Increasingly complex layouts
  - Multiple hives, varied food, obstacles, narrow passages
  - Some maps reward concentrated placement
  - Others reward spread
  
MAP ??: "Freeplay"
  - Procedurally generated maps
  - Unlocked after completing the designed maps
  - Infinite replayability
```

---

## Session Flow

```
1. MAP PRESENTED
   Dark canvas fades in.
   Flowers glow softly in their positions.
   Obstacles faintly visible.
   UI shows: map name, number of hives to place.

2. PLACEMENT PHASE (no time limit)
   Player studies the map.
   Clicks/taps to place hive(s).
   Each hive appears with a warm pulse.
   Hive placement preview follows cursor with a faint glow.
   Can undo/replace hives before starting.

3. "GO"
   Player taps Go (or taps anywhere after all hives are placed).
   Bees emerge from hive(s) — a rapid stream of particles pouring outward.
   Simulation begins.

4. FORAGING (the show — ~45 seconds real time)
   The map transforms.
   Exploration haze builds outward in blue.
   First food discovery — golden recruitment trail blazes back.
   Trail network forms, strengthens, branches.
   Flowers dim as they're harvested.
   The player watches. No interaction needed.
   This is the payoff — the emergent art.

5. TIME'S UP
   Simulation slows (not stops — eases into slow motion).
   Bees gradually return to hives.
   Pheromone trails slowly evaporate (beautiful decay).
   The last trails fade.

6. RESULTS
   Score fades in over the now-dim map.
   Food collected. Stars earned.
   Bonus metrics below.
   "Next Map" / "Retry" / "Watch Again" (replay at 2x speed).
```

### "Watch Again" Feature

This matters. The emergent patterns are beautiful enough to rewatch. Store the simulation state history (or just re-run with same random seed) and let the player watch again at 2x speed. Or in reverse — watching trails dissolve backward is hypnotic.

---

## Audio Design (Web Audio API — Phase 2)

The soundscape IS the pheromone field, translated to sound.

### Ambient Bed

- 2-3 sine oscillators, detuned, with slow LFO on pitch and filter cutoff
- Very quiet at start — almost sub-bass hum
- Volume and richness scales with total pheromone intensity on the map
- As trails build, the ambient fills in — more harmonics, wider stereo, higher cutoff
- Peak foraging = lush, warm ambient wash
- Trail decay = ambient thins, filters close, return to hum

### Bee Sounds

- NOT individual bee sounds (too many bees, would be noise)
- Instead: a soft granular texture representing the swarm
  - Density of grains = number of active bees
  - Pitch center = average bee speed
  - Filtered white noise shaped into a gentle buzz/hum
  - Stereo position follows the swarm's center of mass

### Trail Events

- **New recruitment trail begins** (bee found food): A single clear tone — a soft chime. Pitch mapped to distance from hive (closer = higher, further = lower). Each new trail adds a note to the evolving composition.
- **Trail reaches critical mass** (highway forms): A warm, sustained chord fades in. Different pitch per trail. Multiple strong trails = rich harmony.
- **Flower depleted**: Brief descending tone (gentle, not sad — more like a soft exhale).
- **Hive receives food**: Tiny percussive tick. At high delivery rates, these ticks become a gentle patter — like rain.

### Overall Arc

```
Start:    Near silence. Sub-bass hum.
Early:    Soft granular swarm texture. Blue exploration.
Discovery: First chime. First golden trail. A note appears.
Building:  More chimes. Chords forming. Ambient swelling.
Peak:      Full harmonic wash. Dense patter of deliveries.
           The soundscape mirrors the visual — rich, luminous, alive.
Decay:     Notes fade one by one as trails evaporate.
End:       Return to near-silence. Last tone lingers.
```

---

## Technical Architecture

### File Structure

```
swarm/
├── index.html          # Canvas, font import, entry point, Go button
├── style.css           # Fullscreen canvas, minimal UI positioning
├── main.js             # Game loop, state management, session flow
├── map.js              # Map definitions, flower/obstacle placement, map loading
├── pheromone.js        # Pheromone grid: deposit, diffuse, evaporate, sample
├── bee.js              # Bee class: state machine, steering, sensor logic
├── renderer.js         # ALL drawing: pheromone heatmap, bees, hives, flowers, glow
├── particles.js        # Ambient particles, hive pulse, delivery sparkle
├── audio.js            # Web Audio synthesis (Phase 2)
└── utils.js            # Perlin noise, color helpers, vector math
```

### Rendering Pipeline

```
┌──────────────────────────────────────────────────────────┐
│                   RENDER LOOP (60fps)                     │
│                                                           │
│  1. Clear canvas                                          │
│                                                           │
│  2. Draw background                                       │
│     - Base dark fill                                      │
│     - Animated noise grain                                │
│                                                           │
│  3. Draw pheromone field                                  │
│     - Switch to 'lighter' composite mode                  │
│     - For each grid cell with pheromone > threshold:      │
│       • Color = blend(explorationColor, recruitmentColor, │
│                       ratio of concentrations)            │
│       • Alpha = mapped from total concentration           │
│       • Draw filled rect at cell position                 │
│     - PERFORMANCE: Render to offscreen canvas,            │
│       update only every 2-3 frames                        │
│     - Apply slight blur (CSS filter or manual) for        │
│       smooth gradient feel                                │
│                                                           │
│  4. Draw obstacles                                        │
│     - Very faint outlines or subtle fills                 │
│     - Below pheromone layer in visual hierarchy           │
│                                                           │
│  5. Draw flowers                                          │
│     - Soft glowing circles                                │
│     - Brightness proportional to remaining resources      │
│     - Own glow via shadowBlur                             │
│                                                           │
│  6. Draw hives                                            │
│     - Warm pulsing circles with large glow                │
│     - Pulse synced to delivery rate (faster when active)  │
│                                                           │
│  7. Draw bees                                             │
│     - Bright core pixels with shadowBlur glow             │
│     - Faint 2-3 frame motion trail                        │
│     - Color reflects state (searching vs returning)       │
│     - Draw as batch for performance (hundreds of bees)    │
│                                                           │
│  8. Reset composite mode to 'source-over'                 │
│                                                           │
│  9. Draw ambient particles (sparse, slow)                 │
│                                                           │
│ 10. Draw UI overlay                                       │
│     - Hive count remaining (placement phase)              │
│     - Score/timer (foraging phase)                        │
│     - Go button (placement phase)                         │
└──────────────────────────────────────────────────────────┘
```

### Pheromone Grid — Implementation Detail

This is the most performance-critical system:

```javascript
class PheromoneGrid {
  constructor(width, height, cellSize) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cellSize = cellSize;
    
    // Double-buffered Float32Arrays for each pheromone type
    this.exploration = {
      current: new Float32Array(this.cols * this.rows),
      next:    new Float32Array(this.cols * this.rows),
    };
    this.recruitment = {
      current: new Float32Array(this.cols * this.rows),
      next:    new Float32Array(this.cols * this.rows),
    };
  }
  
  deposit(x, y, type, amount) {
    // Convert world coords to grid coords
    // Add amount to the appropriate cell
  }
  
  sample(x, y, type) {
    // Read concentration at a world position
    // Bilinear interpolation for smooth sampling
  }
  
  sampleDirection(x, y, heading, sensorAngle, sensorDist, type) {
    // Sample at three sensor positions (left, center, right)
    // Return { left, center, right } concentrations
    // This is what bees use to steer
  }
  
  update(diffusionRate, evaporationRate) {
    // For each cell:
    //   next[i] = current[i] * (1 - diffusionRate) 
    //           + avg(neighbors) * diffusionRate
    //   next[i] *= evaporationRate  (e.g., 0.995)
    // Swap current and next buffers
  }
}
```

**Tunable parameters** (critical for visual output):

| Parameter | Range | Effect |
|---|---|---|
| `cellSize` | 4-8px | Grid resolution. Smaller = smoother but more expensive |
| `diffusionRate` | 0.05-0.3 | How fast pheromone spreads. Higher = softer/wider trails |
| `evaporationRate` | 0.990-0.999 | How fast pheromone fades. Lower = sharper, more transient |
| `depositAmount` | 0.1-1.0 | How much pheromone per bee per tick |
| `recruitmentMultiplier` | 2-5x | Recruitment pheromone is deposited stronger than exploration |

### Bee Steering — Implementation Detail

```javascript
class Bee {
  constructor(hive) {
    this.x = hive.x;
    this.y = hive.y;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = BEE_SPEED;  // pixels per frame
    this.state = 'searching';
    this.hive = hive;
  }
  
  update(pheromoneGrid) {
    switch (this.state) {
      case 'searching':
        this.steerTowardPheromone(pheromoneGrid, 'recruitment');
        this.steerAwayFromPheromone(pheromoneGrid, 'exploration'); // prefer unexplored
        this.addRandomSteering();
        this.depositPheromone(pheromoneGrid, 'exploration');
        this.checkForFood();
        break;
        
      case 'returning':
        this.steerTowardPheromone(pheromoneGrid, 'exploration'); // follow own trail home
        this.addRandomSteering(REDUCED_AMOUNT); // less random when returning
        this.depositPheromone(pheromoneGrid, 'recruitment');
        this.checkForHive();
        break;
    }
    
    // Clamp turn rate
    // this.heading change is clamped to MAX_TURN_RATE per frame
    
    // Move forward
    this.x += Math.cos(this.heading) * this.speed;
    this.y += Math.sin(this.heading) * this.speed;
    
    // Bounce off walls and obstacles
  }
  
  steerTowardPheromone(grid, type) {
    const sensors = grid.sampleDirection(
      this.x, this.y, this.heading,
      SENSOR_ANGLE,   // e.g., 30°
      SENSOR_DISTANCE, // e.g., 20px ahead
      type
    );
    
    if (sensors.center >= sensors.left && sensors.center >= sensors.right) {
      // Go straight — no turn adjustment
    } else if (sensors.left > sensors.right) {
      this.heading -= STEER_STRENGTH;
    } else {
      this.heading += STEER_STRENGTH;
    }
  }
}
```

**Tunable bee parameters:**

| Parameter | Range | Effect on Visuals |
|---|---|---|
| `BEE_SPEED` | 2-5 px/frame | Faster = more area covered, trails form quicker |
| `MAX_TURN_RATE` | 5-30°/frame | THE beauty parameter. Lower = sweeping arcs. Higher = fractal chaos. |
| `SENSOR_ANGLE` | 20-45° | Width of the "nose". Narrower = more focused following. |
| `SENSOR_DISTANCE` | 10-30px | How far ahead bees sniff. Longer = smoother paths, earlier decisions. |
| `STEER_STRENGTH` | 2-10°/frame | How hard bees turn toward pheromone. Higher = more obedient trails. |
| `RANDOM_STEER` | 5-20°/frame | Random noise added to heading. More = more exploration, fuzzier trails. |

### State Model

```javascript
const state = {
  // Phase
  phase: 'placement' | 'foraging' | 'results',
  
  // Map
  map: {
    name: string,
    width: number,
    height: number,
    flowers: [{ x, y, resource, maxResource, color }],
    obstacles: [{ type: 'rect'|'circle', ...params }],
    hivesAllowed: number,
    starThresholds: [50, 75, 90], // percent of food for 1/2/3 stars
  },
  
  // Placed by player
  hives: [{
    x, y,
    foodCollected: number,
    pulseT: number,
  }],
  
  // Simulation
  bees: Bee[], // hundreds
  pheromoneGrid: PheromoneGrid,
  
  // Timing
  simTime: number,      // simulation ticks elapsed
  simDuration: number,  // total ticks for this map
  simSpeed: number,     // ticks per frame (for fast-forward/slow-mo)
  
  // Scoring
  totalFood: number,
  maxFood: number,      // total available across all flowers
  
  // Rendering
  camera: { x, y, zoom },
  particles: [{ x, y, vx, vy, life, color }],
};
```

---

## Interaction Design

### Placement Phase

**Desktop:**
- Mouse move: hive preview follows cursor (warm glow circle)
- Click: place hive. Satisfying pulse on placement.
- Right-click or click existing hive: remove (allows repositioning)
- All hives placed → "Go" button appears (or spacebar)

**Mobile:**
- Tap: place hive at position
- Tap existing hive: remove
- All placed → "Go" button in corner

### Foraging Phase

**No interaction.** This is intentional. You watch. The simulation runs. Your decisions were made during placement — now you witness the consequences. This constraint is what makes placement meaningful.

Optional: mouse/touch drag to slightly pan the camera on larger maps. Scroll/pinch to zoom.

### Results Phase

- Tap "Retry" to try same map with different placement
- Tap "Next" to advance
- Tap "Watch Again" to replay (this is a gift, not a throwaway feature)

---

## Feedback & Juice

**Hive Placement:**
- Warm radial pulse expands outward from hive
- Soft particle burst
- Hive glows and begins breathing

**"Go" Button Pressed:**
- Brief pause (100ms) — the breath before the plunge
- Then: bees erupt from hive(s) in a radial burst
- The initial explosion of particles from the hive is a key visual moment

**First Food Discovery:**
- The bee that finds food flares brighter
- The flower pulses
- The return journey begins — and you can SEE the recruitment trail start to form
- This is the "aha" moment of every session

**Trail Highway Formation:**
- As a trail strengthens, it visually widens and brightens
- The golden rivers cutting through the blue haze is deeply satisfying
- Intersections where trails cross glow especially bright (additive blending)

**Flower Depletion:**
- Flower gently fades as resources drain
- Last harvest: flower dims to a ghost, brief particle release (pollen dispersing)

**End of Simulation:**
- Simulation eases into slow motion (not abrupt stop)
- Bees gradually return home
- Pheromone trails evaporate — beautiful fading rivers
- The last traces of light dissolve into darkness
- Score fades in over the quiet map

---

## Design Principles

1. **The pheromone field is the art.** Bees are dots. Flowers are dots. Hives are dots. The *trails* are the painting. Every rendering and simulation decision should serve the beauty of the pheromone field. If the trails don't glow, branch, and flow like rivers of light, nothing else matters.

2. **Placement is the only decision — make it count.** Because the player's only input is where to put hives, that choice must feel weighty. The map design must create situations where placement genuinely matters — where 50 pixels to the left produces a completely different trail network.

3. **Emergence is the magic trick.** Don't script the trail formation. Don't optimize the paths. Let the simulation run honestly. The most beautiful moments will be ones nobody designed — a trail that splits around an obstacle and reconverges, two hives' territories meeting and forming a clean border, a long exploratory tendril finally connecting to a distant flower.

4. **The transformation is the experience.** Every session follows the same emotional arc: chaos → exploration → discovery → structure → beauty → decay. That arc — watching noise become order become art — is what makes this worth playing again.

5. **Turning radius is sacred.** The max turn rate parameter controls the entire visual character of the game. Too high and trails are noisy scribbles. Too low and exploration is boringly smooth. Find the sweet spot where trails curve organically — like rivers, like roots, like veins — and protect it.

6. **Respect the dark.** Same as Bloom: the black canvas is what makes the light meaningful. Don't over-saturate. Don't fill the screen. The most beautiful frame is one where glowing trails occupy 30% of the darkness and the rest is void.

---

*"You don't draw the map. You don't direct the bees. You choose where life begins — and then you watch intelligence emerge from instinct."*
