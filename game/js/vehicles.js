// vehicles.js — car physics, parked cars to steal, and traffic AI on the road grid.
// Cars are simple arcade bodies: position, heading, speed. Traffic follows avenue/street
// centre lines, picks a new heading at intersections, and brakes for the car ahead.
import { AVENUES, STREETS, ROAD_W, BEACH_Y, hitsBuilding, isWater } from './city.js';
import { sfxCrash } from './audio.js';

export const CAR_COLORS = ['#e63946', '#f1fa8c', '#2a9d8f', '#4361ee', '#ff8a3d', '#e0e0e0', '#22223b', '#ff5d8f', '#90be6d', '#f9c74f'];
export const CAR_NAMES = ['Brisa Coupe', 'Marea Sedan', 'Coral Pickup', 'Faro Taxi', 'Gaviota Hatch', 'Perla Van'];

let nextCarId = 1;
export function makeCar(x, y, angle, color, kind = 'traffic') {
  return {
    id: nextCarId++, x, y, angle, speed: 0, w: 44, h: 22,
    color: color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    name: CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)],
    kind, health: 100, driver: kind !== 'parked',
    // traffic AI state
    dirX: Math.cos(angle), dirY: Math.sin(angle), targetSpeed: 120 + Math.random() * 60,
    turnCooldown: 0, stuckTime: 0, honked: 0,
  };
}

// Spawn parked cars along road edges and a starter set of moving traffic.
export function spawnVehicles(cars) {
  cars.length = 0;
  for (const a of AVENUES) {
    for (let y = 170; y < BEACH_Y - 120; y += 210 + Math.random() * 160) {
      if (Math.random() < 0.72) cars.push(makeCar(a + ROAD_W / 2 - 20, y, Math.PI / 2, null, 'parked'));
      if (Math.random() < 0.5) cars.push(makeCar(a - ROAD_W / 2 + 20, y + 90, -Math.PI / 2, null, 'parked'));
    }
  }
  for (let i = 0; i < 16; i++) {
    const vertical = Math.random() < 0.5;
    if (vertical) {
      const a = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      const dir = Math.random() < 0.5 ? 1 : -1;
      cars.push(makeCar(a + dir * 26, 200 + Math.random() * (BEACH_Y - 400), dir > 0 ? Math.PI / 2 : -Math.PI / 2, null, 'traffic'));
    } else {
      const s = STREETS[Math.floor(Math.random() * STREETS.length)];
      const dir = Math.random() < 0.5 ? 1 : -1;
      cars.push(makeCar(200 + Math.random() * 2800, s + dir * 26, dir > 0 ? 0 : Math.PI, null, 'traffic'));
    }
  }
}

const ACCEL = 260, BRAKE = 420, MAX_SPEED = 430, MAX_REVERSE = 130, FRICTION = 0.9;

// Player driving: input-driven physics with building collision and crash feedback.
export function updatePlayerCar(car, input, dt, world) {
  const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  if (fwd > 0) car.speed += ACCEL * dt;
  else if (fwd < 0) car.speed -= (car.speed > 10 ? BRAKE : ACCEL * 0.6) * dt;
  car.speed *= Math.pow(FRICTION, dt * 10);
  if (input.handbrake) car.speed *= Math.pow(0.25, dt);
  car.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, car.speed));
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (Math.abs(car.speed) > 4) {
    const grip = input.boost ? 1.25 : 1;
    car.angle += steer * 2.1 * grip * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 160);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  stepCar(car, nx, ny, world);
  if (isWater(car.x, car.y)) car.speed *= Math.pow(0.1, dt); // the sea stalls any car
}

function stepCar(car, nx, ny, world) {
  const r = 20;
  if (!hitsBuilding(nx, ny, r)) { car.x = nx; car.y = ny; }
  else {
    if (Math.abs(car.speed) > 120) { sfxCrash(Math.min(1, Math.abs(car.speed) / 400)); world.onCrash(car, Math.abs(car.speed)); }
    car.speed *= -0.25;
  }
  car.x = Math.max(30, Math.min(3330, car.x));
  car.y = Math.max(30, Math.min(2490, car.y));
}

// Traffic: drive along the current road axis; at an intersection, maybe turn.
export function updateTrafficCar(car, dt, world) {
  if (car.kind !== 'traffic' || !car.driver) return;
  car.turnCooldown -= dt;
  const onAvenue = AVENUES.some((a) => Math.abs(car.x - a) < ROAD_W / 2 + 4);
  const onStreet = STREETS.some((s) => Math.abs(car.y - s) < ROAD_W / 2 + 4);
  // Desired lane centre: keep to the right side of the road being travelled.
  let tx = car.x, ty = car.y;
  if (Math.abs(car.dirY) > 0.5) { // travelling vertically on an avenue
    const a = nearest(AVENUES, car.x);
    tx = a - Math.sign(car.dirY) * 26; // right-hand traffic: northbound uses the east lane
    ty = car.y + car.dirY * 100;
  } else {
    const s = nearest(STREETS, car.y);
    ty = s + car.dirX * 26; // right-hand traffic: eastbound uses the south lane, westbound the north
    tx = car.x + car.dirX * 100;
  }
  // Brake for anything ahead (cars, the player, crossing peds).
  let want = car.targetSpeed;
  for (const other of world.allCars()) {
    if (other === car) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * car.dirX + dy * car.dirY;
    const side = Math.abs(dx * car.dirY - dy * car.dirX);
    if (ahead > 0 && ahead < 78 && side < 26) { want = 0; break; }
  }
  const p = world.playerPos();
  const pdx = p.x - car.x, pdy = p.y - car.y;
  if (pdx * car.dirX + pdy * car.dirY > 0 && pdx * car.dirX + pdy * car.dirY < 70 && Math.abs(pdx * car.dirY - pdy * car.dirX) < 24) want = 0;
  car.speed += Math.max(-BRAKE * dt, Math.min(ACCEL * 0.6 * dt, want - car.speed));
  if (Math.abs(car.speed) < 4 && want === 0) { car.stuckTime += dt; } else car.stuckTime = 0;
  // At an intersection, sometimes turn onto the crossing road.
  if (onAvenue && onStreet && car.turnCooldown <= 0 && Math.random() < 0.012) {
    if (Math.abs(car.dirY) > 0.5) { const d = Math.random() < 0.5 ? 1 : -1; car.dirX = d; car.dirY = 0; }
    else { const d = Math.random() < 0.5 ? 1 : -1; car.dirY = d; car.dirX = 0; }
    car.turnCooldown = 2.5;
  }
  // Keep inside the road network: bounce off the beach end and world edges.
  if (car.y > BEACH_Y - 80 && car.dirY > 0) { car.dirY = 0; car.dirX = Math.random() < 0.5 ? 1 : -1; }
  if (car.y < 90 && car.dirY < 0) { car.dirY = 0; car.dirX = 1; }
  if (car.x < 90 && car.dirX < 0) { car.dirX = 0; car.dirY = 1; }
  if (car.x > 3270 && car.dirX > 0) { car.dirX = 0; car.dirY = -1; }
  const targetAngle = Math.atan2(car.dirY, car.dirX);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += diff * Math.min(1, dt * 4);
  // Lane-centre steering: blend heading toward the lane point.
  const laneAngle = Math.atan2(ty - car.y, tx - car.x);
  let ld = laneAngle - car.angle;
  while (ld > Math.PI) ld -= Math.PI * 2;
  while (ld < -Math.PI) ld += Math.PI * 2;
  car.angle += ld * Math.min(1, dt * 1.6);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (!hitsBuilding(nx, ny, 20)) { car.x = nx; car.y = ny; } else { car.speed = 0; car.dirX = -car.dirX; car.dirY = -car.dirY; }
}

function nearest(arr, v) { let best = arr[0]; for (const a of arr) if (Math.abs(a - v) < Math.abs(best - v)) best = a; return best; }

// Car-vs-car bumps: separate overlapping cars, trade a little speed, report hard hits.
export function collideCars(cars, world) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 42 * 42 || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (42 - d) / 2, ux = dx / d, uy = dy / d;
      if (!hitsBuilding(a.x - ux * push, a.y - uy * push, 18)) { a.x -= ux * push; a.y -= uy * push; }
      if (!hitsBuilding(b.x + ux * push, b.y + uy * push, 18)) { b.x += ux * push; b.y += uy * push; }
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 130) { sfxCrash(Math.min(1, impact / 380)); world.onCarHit(a, b, impact); a.health -= 6; b.health -= 6; }
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.8; b.speed = avg * 0.8;
    }
  }
}

export function drawCar(ctx, car, isPlayerCar = false) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 5, car.w, car.h);
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(20,24,40,0.9)';
  roundRect(ctx, -6, -car.h / 2 + 4, 17, car.h - 8, 3); ctx.fill(); // windshield + cabin
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.w / 2 - 3, -car.h / 2 + 3, 3, 5);
  ctx.fillRect(car.w / 2 - 3, car.h / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff4040';
  ctx.fillRect(-car.w / 2, -car.h / 2 + 3, 3, 5);
  ctx.fillRect(-car.w / 2, car.h / 2 - 8, 3, 5);
  ctx.fillStyle = '#191919';
  ctx.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 10, 5); ctx.fillRect(car.w / 2 - 14, -car.h / 2 - 3, 10, 5);
  ctx.fillRect(-car.w / 2 + 4, car.h / 2 - 2, 10, 5); ctx.fillRect(car.w / 2 - 14, car.h / 2 - 2, 10, 5);
  if (car.health < 45) { // smoke damage hint
    ctx.fillStyle = 'rgba(60,60,60,0.55)';
    ctx.beginPath(); ctx.arc(car.w / 2 - 4, 0, 6 + (100 - car.health) / 12, 0, 7); ctx.fill();
  }
  if (isPlayerCar) {
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
    roundRect(ctx, -car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 8); ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
