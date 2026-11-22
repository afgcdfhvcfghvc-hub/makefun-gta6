// police.js — the Policía Portuaria: wanted stars, patrol spawns, pursuit driving and
// the busted / escape logic. Stars rise with witnessed crimes and decay out of sight.
import { hitsBuilding, isWater, WORLD_W, BEACH_Y } from './city.js';
import { sfxSirenBlip } from './audio.js';

export const wanted = {
  level: 0,          // 0..5 stars
  heat: 0,           // fractional progress toward the next star
  unseenTime: 0,     // seconds since a crime or a police car last saw the player
  bustTimer: 0,      // seconds the player has been pinned by police
  sirenTimer: 0,
};

export function resetWanted() {
  wanted.level = 0; wanted.heat = 0; wanted.unseenTime = 0; wanted.bustTimer = 0;
}

// Report a crime. amount is in "heat": 1.0 heat = one star once it settles.
export function addHeat(amount) {
  wanted.heat += amount;
  wanted.unseenTime = 0;
  while (wanted.heat >= 1 && wanted.level < 5) { wanted.level++; wanted.heat -= 1; }
  if (wanted.level >= 5) wanted.heat = Math.min(wanted.heat, 0.99);
}

export function makeCopCar(x, y) {
  return {
    id: -1 - Math.floor(Math.random() * 100000), x, y, angle: 0, speed: 0, w: 46, h: 23,
    color: '#f2f2f2', name: 'Patrulla', kind: 'police', health: 130, driver: true,
    dirX: 0, dirY: 0, targetSpeed: 300, turnCooldown: 0, stuckTime: 0, lightPhase: Math.random() * 6,
  };
}

// Keep a number of patrol cars in play proportional to the wanted level, spawning
// them on roads a few blocks away so they drive in rather than pop in.
export function updatePoliceSpawning(state, dt, cops) {
  const want = wanted.level === 0 ? 0 : Math.min(2 + wanted.level, 7);
  if (cops.length < want) {
    state.spawnTimer = (state.spawnTimer || 0) - dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 1.6;
      const a = Math.random() * Math.PI * 2, d = 620 + Math.random() * 260;
      let x = state.player.x + Math.cos(a) * d, y = state.player.y + Math.sin(a) * d;
      x = Math.max(80, Math.min(WORLD_W - 80, x)); y = Math.max(80, Math.min(BEACH_Y - 120, y));
      if (!hitsBuilding(x, y, 24)) {
        const cop = makeCopCar(x, y);
        cop.angle = Math.atan2(state.player.y - y, state.player.x - x);
        cops.push(cop);
      }
    }
  }
  // Officers give up and drive off once the heat is fully gone.
  if (wanted.level === 0) {
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      if (Math.hypot(c.x - state.player.x, c.y - state.player.y) > 700) cops.splice(i, 1);
    }
  }
}

// Pursuit driving: aim at the player's position (or a point just ahead of their car),
// steer smoothly, and ram — a cop that stays in contact with a slow player busts them.
export function updateCopCar(cop, dt, state, world) {
  cop.lightPhase += dt * 9;
  const target = state.player.inCar && state.player.car ? state.player.car : state.player;
  const dx = target.x - cop.x, dy = target.y - cop.y;
  const dist = Math.hypot(dx, dy);
  const seen = dist < 560;
  if (seen) wanted.unseenTime = 0;
  const lead = state.player.inCar ? 0.35 : 0.1;
  const tx = target.x + (target.vx || 0) * lead, ty = target.y + (target.vy || 0) * lead;
  const wantAngle = Math.atan2(ty - cop.y, tx - cop.x);
  let diff = wantAngle - cop.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cop.angle += diff * Math.min(1, dt * 2.6);
  const topSpeed = 305 + wanted.level * 26;
  const want = dist > 46 ? topSpeed : topSpeed * 0.35;
  cop.speed += Math.max(-430 * dt, Math.min(300 * dt, want - cop.speed));
  const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
  const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
  if (!hitsBuilding(nx, ny, 20)) { cop.x = nx; cop.y = ny; }
  else { cop.speed *= -0.3; cop.angle += 0.7 * dt * 10; }
  if (isWater(cop.x, cop.y)) cop.speed *= Math.pow(0.05, dt);
  // Ramming hurts the player's car and the player on foot.
  if (dist < 40 && Math.abs(cop.speed) > 60) world.onCopRam(cop, target);
  return seen;
}

// Wanted bookkeeping per frame: decay when unseen, bust check when pinned.
export function updateWanted(state, dt, cops, world) {
  wanted.unseenTime += dt;
  if (wanted.level > 0 && wanted.unseenTime > 7 + wanted.level * 2) {
    wanted.level--;
    wanted.heat = 0;
    wanted.unseenTime = 3;
    if (wanted.level === 0) world.onEscaped();
  }
  // Busted: a cop within arm's reach while the player is nearly stopped, for 2 seconds.
  const playerSpeed = state.player.inCar && state.player.car ? Math.abs(state.player.car.speed) : state.player.speedNow;
  let pinned = false;
  if (wanted.level > 0) {
    for (const c of cops) {
      if (Math.hypot(c.x - state.player.x, c.y - state.player.y) < 52 && playerSpeed < 42) { pinned = true; break; }
    }
  }
  wanted.bustTimer = pinned ? wanted.bustTimer + dt : Math.max(0, wanted.bustTimer - dt * 2);
  if (wanted.bustTimer > 2) { wanted.bustTimer = 0; world.onBusted(); }
  // Siren hints while pursued.
  wanted.sirenTimer -= dt;
  if (wanted.level > 0 && cops.length > 0 && wanted.sirenTimer <= 0) { wanted.sirenTimer = 1.4; sfxSirenBlip(); }
}

export function drawCopCar(ctx, cop) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.rotate(cop.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-cop.w / 2 + 3, -cop.h / 2 + 5, cop.w, cop.h);
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.roundRect(-cop.w / 2, -cop.h / 2, cop.w, cop.h, 6); ctx.fill();
  ctx.fillStyle = '#1d4e89';
  ctx.fillRect(-cop.w / 2, -4, cop.w, 8);
  ctx.fillStyle = 'rgba(20,24,40,0.9)';
  ctx.beginPath(); ctx.roundRect(-6, -cop.h / 2 + 4, 17, cop.h - 8, 3); ctx.fill();
  // Light bar: alternating red / blue strobes.
  const on = Math.sin(cop.lightPhase) > 0;
  ctx.fillStyle = on ? '#ff2d2d' : '#5a0f0f';
  ctx.fillRect(-4, -cop.h / 2 + 1, 9, 5);
  ctx.fillStyle = on ? '#274bff' : '#101f5a';
  ctx.fillRect(-4, cop.h / 2 - 6, 9, 5);
  ctx.fillStyle = '#191919';
  ctx.fillRect(-cop.w / 2 + 4, -cop.h / 2 - 3, 10, 5); ctx.fillRect(cop.w / 2 - 14, -cop.h / 2 - 3, 10, 5);
  ctx.fillRect(-cop.w / 2 + 4, cop.h / 2 - 2, 10, 5); ctx.fillRect(cop.w / 2 - 14, cop.h / 2 - 2, 10, 5);
  ctx.restore();
  if (on) { // soft glow so chases read at a glance
    ctx.fillStyle = 'rgba(255,60,60,0.10)';
    ctx.beginPath(); ctx.arc(cop.x, cop.y, 44, 0, 7); ctx.fill();
  }
}
