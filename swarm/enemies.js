// ============================================================
// SWARM — enemies.js
// Wasp class: patrol waypoints, bee killing
// ============================================================

class Wasp {
  constructor(def, canvasWidth, canvasHeight) {
    // Resolve normalized patrol waypoints to pixel coords
    this.patrol = def.patrol.map(p => ({
      x: p.x * canvasWidth,
      y: p.y * canvasHeight,
    }));
    this.speed = def.speed || 1.5;
    this.killRadius = def.killRadius || 25;
    this.waypointIndex = 0;
    this.progress = 0; // 0-1 between current and next waypoint

    // Start at first waypoint
    this.x = this.patrol[0].x;
    this.y = this.patrol[0].y;
    this.heading = 0;
  }

  update() {
    if (this.patrol.length < 2) return;

    const from = this.patrol[this.waypointIndex];
    const to = this.patrol[(this.waypointIndex + 1) % this.patrol.length];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (segLen < 0.1) {
      this.waypointIndex = (this.waypointIndex + 1) % this.patrol.length;
      return;
    }

    // Advance along segment
    this.progress += this.speed / segLen;

    if (this.progress >= 1) {
      this.progress = 0;
      this.waypointIndex = (this.waypointIndex + 1) % this.patrol.length;
    }

    // Interpolate position
    const curr = this.patrol[this.waypointIndex];
    const next = this.patrol[(this.waypointIndex + 1) % this.patrol.length];
    this.x = lerp(curr.x, next.x, this.progress);
    this.y = lerp(curr.y, next.y, this.progress);
    this.heading = Math.atan2(next.y - curr.y, next.x - curr.x);
  }

  // Check proximity to a bee, return true if within kill radius
  canKill(bee) {
    if (bee.dead || !bee.active) return false;
    const dx = this.x - bee.x;
    const dy = this.y - bee.y;
    return dx * dx + dy * dy < this.killRadius * this.killRadius;
  }
}
