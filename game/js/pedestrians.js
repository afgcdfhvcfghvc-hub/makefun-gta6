// pedestrians.js — citizens of Puerto Solmar: they stroll the sidewalks and the beach,
// wander between waypoints, and flee in panic from gunfire, fights and fast cars.
import { AVENUES, STREETS, ROAD_W, BEACH_Y, WORLD_W, moveWithCollision, isWater } from './city.js';

const SHIRTS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#f9f9f9', '#95d5b2', '#ff9f1c', '#6a8eae'];
const NAMES = ['Lucía', 'Marco', 'Sofía', 'Diego', 'Carmen', 'Pablo', 'Elena', 'Raúl', 'Nuria', 'Hugo'];

export function makePed(x, y) {
  return {
    x, y, angle: Math.random() * Math.PI * 2, speed: 0,
    walkSpeed: 34 + Math.random() * 30, tx: x, ty: y, wait: Math.random() * 2,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    state: 'walk', // walk | flee | down
    panic: 0, health: 100, legPhase: Math.random() * 6,
  };
}

export function spawnPedestrians(peds, count = 42) {
  peds.length = 0;
  for (let i = 0; i < count; i++) {
    // Sidewalk spots: just beside a road, or along the beach promenade.
    let x, y;
    if (Math.random() < 0.22) { x = 80 + Math.random() * (WORLD_W - 160); y = BEACH_Y + 24 + Math.random() * 130; }
    else if (Math.random() < 0.5) {
      const a = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      x = a + (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 18);
      y = 90 + Math.random() * (BEACH_Y - 180);
    } else {
      const s = STREETS[Math.floor(Math.random() * STREETS.length)];
      y = s + (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 18);
      x = 90 + Math.random() * (WORLD_W - 180);
    }
    peds.push(makePed(x, y));
  }
}

function pickWaypoint(ped) {
  // Stroll a block or two from where they stand.
  ped.tx = Math.max(50, Math.min(WORLD_W - 50, ped.x + (Math.random() - 0.5) * 560));
  ped.ty = Math.max(60, Math.min(BEACH_Y + 150, ped.y + (Math.random() - 0.5) * 560));
}

export function scarePeds(peds, x, y, radius) {
  for (const p of peds) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius && p.state !== 'down') { p.state = 'flee'; p.panic = 2.5 + Math.random() * 2; p.fleeX = x; p.fleeY = y; }
  }
}

export function updatePedestrian(ped, dt, world) {
  if (ped.state === 'down') return;
  ped.legPhase += dt * (4 + ped.speed * 0.08);
  let wantSpeed = ped.walkSpeed;
  if (ped.state === 'flee') {
    ped.panic -= dt;
    if (ped.panic <= 0) ped.state = 'walk';
    const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
    ped.angle = away;
    wantSpeed = 165;
    moveWithCollision(ped, Math.cos(away) * wantSpeed * dt, Math.sin(away) * wantSpeed * dt, 9);
    ped.speed = wantSpeed;
    return;
  }
  // Danger sense: a fast car very close makes them dive away.
  const threat = world.fastCarNear(ped.x, ped.y, 60);
  if (threat) {
    ped.state = 'flee'; ped.panic = 1.4; ped.fleeX = threat.x; ped.fleeY = threat.y;
    return;
  }
  const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12 || ped.wait > 0) {
    ped.wait -= dt;
    ped.speed = 0;
    if (dist < 12 && ped.wait <= -0.1) { pickWaypoint(ped); ped.wait = Math.random() * 2.4; }
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.speed = wantSpeed;
  moveWithCollision(ped, Math.cos(ped.angle) * wantSpeed * dt, Math.sin(ped.angle) * wantSpeed * dt, 9);
  if (isWater(ped.x, ped.y)) ped.y = BEACH_Y + 120; // nobody strolls into the sea
}

export function drawPedestrian(ctx, ped, isPlayer = false) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(0, 3, 8, 4, 0, 0, 7); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = ped.shirt; ctx.fillRect(-4, -9, 8, 18);
    ctx.fillStyle = '#e8b08a'; ctx.beginPath(); ctx.arc(0, -13, 5, 0, 7); ctx.fill();
    ctx.restore();
    return;
  }
  const step = Math.sin(ped.legPhase) * (ped.speed > 2 ? 3.4 : 0);
  ctx.strokeStyle = '#2d3142'; ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(step, 7);
  ctx.moveTo(0, 0); ctx.lineTo(-step, 7);
  ctx.stroke();
  ctx.fillStyle = isPlayer ? '#ffd23f' : ped.shirt;
  ctx.beginPath(); ctx.arc(0, -1, 6.4, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8b08a';
  ctx.beginPath(); ctx.arc(0, -9, 4.6, 0, 7); ctx.fill();
  if (isPlayer) { // Rico's cap
    ctx.fillStyle = '#d62828';
    ctx.beginPath(); ctx.arc(0, -10.5, 4.8, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
