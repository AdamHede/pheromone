// ============================================================
// SWARM — bee.js
// Bee class: state machine, pheromone steering, obstacle avoidance
// ============================================================

const BeeState = {
  SEARCHING: 'searching',
  HARVESTING: 'harvesting',
  RETURNING: 'returning',
  DELIVERING: 'delivering',
};

// Tunable constants
const BEE_SPEED = 3;
const MAX_TURN_RATE = degToRad(15);     // THE beauty parameter
const SENSOR_ANGLE = degToRad(30);
const SENSOR_DISTANCE = 20;
const STEER_STRENGTH = degToRad(5);
const RANDOM_STEER = degToRad(10);
const HARVEST_DURATION = 30;            // frames (~0.5s at 60fps)
const DELIVER_DURATION = 18;            // frames (~0.3s)
const EXPLORATION_DEPOSIT = 0.15;
const RECRUITMENT_DEPOSIT = 0.5;
const RECRUITMENT_STEER_WEIGHT = 3.0;   // Recruitment attraction vs exploration repulsion
const HIVE_HOMING_BIAS = 0.15;          // Blend toward hive in returning state
const FLOWER_DETECT_RADIUS = 15;
const HIVE_DETECT_RADIUS = 20;
const TRAIL_LENGTH = 3;

class Bee {
  constructor(hive, rng) {
    this.hive = hive;
    this.x = hive.x;
    this.y = hive.y;
    this.heading = rng.next() * Math.PI * 2;
    this.speed = BEE_SPEED;
    this.state = BeeState.SEARCHING;
    this.stateTimer = 0;
    this.targetFlower = null;
    this.rng = rng;
    this.spawnDelay = 0;
    this.active = false;

    // Motion trail ring buffer
    this.trail = [];
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.trail.push({ x: this.x, y: this.y });
    }
    this.trailIndex = 0;
  }

  update(pheromoneGrid, flowers, obstacles, bounds) {
    // Handle spawn delay
    if (this.spawnDelay > 0) {
      this.spawnDelay--;
      return;
    }
    this.active = true;

    // Store position in trail
    this.trail[this.trailIndex] = { x: this.x, y: this.y };
    this.trailIndex = (this.trailIndex + 1) % TRAIL_LENGTH;

    let desiredTurn = 0;

    switch (this.state) {
      case BeeState.SEARCHING:
        desiredTurn = this._searching(pheromoneGrid, flowers);
        break;
      case BeeState.HARVESTING:
        this._harvesting(flowers);
        return; // No movement while harvesting
      case BeeState.RETURNING:
        desiredTurn = this._returning(pheromoneGrid);
        break;
      case BeeState.DELIVERING:
        this._delivering();
        return; // No movement while delivering
    }

    // Clamp turn rate
    desiredTurn = clamp(desiredTurn, -MAX_TURN_RATE, MAX_TURN_RATE);
    this.heading += desiredTurn;

    // Move forward
    const nx = this.x + Math.cos(this.heading) * this.speed;
    const ny = this.y + Math.sin(this.heading) * this.speed;

    // Bounce off map edges
    if (nx < 2 || nx > bounds.width - 2) {
      this.heading = Math.PI - this.heading;
      this.heading += this.rng.range(-0.5, 0.5);
    } else if (ny < 2 || ny > bounds.height - 2) {
      this.heading = -this.heading;
      this.heading += this.rng.range(-0.5, 0.5);
    }

    // Check obstacle collision
    const nextX = this.x + Math.cos(this.heading) * this.speed;
    const nextY = this.y + Math.sin(this.heading) * this.speed;

    if (!pheromoneGrid.isPassable(nextX, nextY)) {
      // Bounce: reflect and add random perturbation
      this.heading += Math.PI * 0.5 + this.rng.range(-0.8, 0.8);
      // Don't move this frame
      return;
    }

    this.x = clamp(nextX, 2, bounds.width - 2);
    this.y = clamp(nextY, 2, bounds.height - 2);
  }

  _searching(pheromoneGrid, flowers) {
    // Deposit exploration pheromone
    pheromoneGrid.deposit(this.x, this.y, 'exploration', EXPLORATION_DEPOSIT);

    let turn = 0;

    // 1. Steer toward recruitment pheromone (attraction)
    const recSensors = pheromoneGrid.sampleDirection(
      this.x, this.y, this.heading, SENSOR_ANGLE, SENSOR_DISTANCE, 'recruitment'
    );
    const recMax = Math.max(recSensors.left, recSensors.center, recSensors.right);
    if (recMax > 0.01) {
      if (recSensors.center >= recSensors.left && recSensors.center >= recSensors.right) {
        // Go straight
      } else if (recSensors.left > recSensors.right) {
        turn -= STEER_STRENGTH * RECRUITMENT_STEER_WEIGHT;
      } else if (recSensors.right > recSensors.left) {
        turn += STEER_STRENGTH * RECRUITMENT_STEER_WEIGHT;
      } else {
        turn += this.rng.chance(0.5) ? STEER_STRENGTH : -STEER_STRENGTH;
      }
    }

    // 2. Steer away from exploration pheromone (prefer unexplored)
    const expSensors = pheromoneGrid.sampleDirection(
      this.x, this.y, this.heading, SENSOR_ANGLE, SENSOR_DISTANCE, 'exploration'
    );
    const expMax = Math.max(expSensors.left, expSensors.center, expSensors.right);
    if (expMax > 0.05 && recMax < 0.01) {
      // Only repel from exploration when not following recruitment
      if (expSensors.left > expSensors.right) {
        turn += STEER_STRENGTH * 0.5; // Turn away (right) from stronger left
      } else if (expSensors.right > expSensors.left) {
        turn -= STEER_STRENGTH * 0.5;
      }
    }

    // 3. Random steering
    turn += this.rng.range(-RANDOM_STEER, RANDOM_STEER);

    // 4. Check for food
    this._checkForFood(flowers);

    return turn;
  }

  _returning(pheromoneGrid) {
    // Deposit recruitment pheromone
    pheromoneGrid.deposit(this.x, this.y, 'recruitment', RECRUITMENT_DEPOSIT);

    let turn = 0;

    // 1. Follow own exploration pheromone trail home
    const expSensors = pheromoneGrid.sampleDirection(
      this.x, this.y, this.heading, SENSOR_ANGLE, SENSOR_DISTANCE, 'exploration'
    );
    const expMax = Math.max(expSensors.left, expSensors.center, expSensors.right);
    if (expMax > 0.005) {
      if (expSensors.center >= expSensors.left && expSensors.center >= expSensors.right) {
        // Go straight
      } else if (expSensors.left > expSensors.right) {
        turn -= STEER_STRENGTH;
      } else if (expSensors.right > expSensors.left) {
        turn += STEER_STRENGTH;
      }
    }

    // 2. Hive homing bias (weak fallback)
    const toHive = Math.atan2(this.hive.y - this.y, this.hive.x - this.x);
    const homingDiff = normalizeAngle(toHive - this.heading);
    turn += homingDiff * HIVE_HOMING_BIAS;

    // 3. Reduced random steering
    turn += this.rng.range(-RANDOM_STEER * 0.3, RANDOM_STEER * 0.3);

    // 4. Check if reached hive
    const dx = this.hive.x - this.x;
    const dy = this.hive.y - this.y;
    if (dx * dx + dy * dy < HIVE_DETECT_RADIUS * HIVE_DETECT_RADIUS) {
      this.state = BeeState.DELIVERING;
      this.stateTimer = DELIVER_DURATION;
      this.x = this.hive.x;
      this.y = this.hive.y;
    }

    return turn;
  }

  _harvesting(flowers) {
    this.stateTimer--;
    if (this.targetFlower) {
      this.targetFlower.harvestPulse = 1;
    }
    if (this.stateTimer <= 0) {
      // Harvest the flower
      if (this.targetFlower && this.targetFlower.resource > 0) {
        this.targetFlower.resource--;
      }
      this.state = BeeState.RETURNING;
      // Turn around to head home
      this.heading = Math.atan2(this.hive.y - this.y, this.hive.x - this.x);
      this.heading += this.rng.range(-0.3, 0.3); // slight randomness
      this.targetFlower = null;
    }
  }

  _delivering() {
    this.stateTimer--;
    if (this.stateTimer <= 0) {
      this.state = BeeState.SEARCHING;
      // Head out in a random direction
      this.heading = this.rng.next() * Math.PI * 2;
      this.hive.foodCollected++;
      this.hive.flashTimer = 8;
      this.hive.justDelivered = true;
    }
  }

  _checkForFood(flowers) {
    for (const flower of flowers) {
      if (flower.resource <= 0) continue;
      const dx = flower.x - this.x;
      const dy = flower.y - this.y;
      if (dx * dx + dy * dy < FLOWER_DETECT_RADIUS * FLOWER_DETECT_RADIUS) {
        this.state = BeeState.HARVESTING;
        this.stateTimer = HARVEST_DURATION;
        this.targetFlower = flower;
        this.x = flower.x;
        this.y = flower.y;
        return;
      }
    }
  }
}
