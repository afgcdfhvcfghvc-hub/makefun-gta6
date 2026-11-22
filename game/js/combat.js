// combat.js — on-foot fighting for Solmar Vice: a short-range melee swing (F or click
// near) and a pistol shot aimed with the mouse. Bullets are short-lived tracers that can
// drop pedestrians, damage cars and raise the player's wanted level.
import { hitsBuilding } from './city.js';
import { sfxShoot, sfxMelee } from './audio.js';
import { scarePeds } from './pedestrians.js';

export const combat = {
  bullets: [],       // {x,y,vx,vy,life}
  swingTimer: 0,
  fireCooldown: 0,
  muzzle: 0,
};

export function resetCombat() {
  combat.bullets.length = 0;
  combat.swingTimer = 0; combat.fireCooldown = 0; combat.muzzle = 0;
}

// Melee: hits anything living or drivable within a short arc in front of the player.
export function tryMelee(state, world) {
  if (combat.swingTimer > 0) return;
  combat.swingTimer = 0.32;
  sfxMelee();
  const px = state.player.x, py = state.player.y, aim = state.player.aimAngle;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - px, ped.y - py);
    if (d < 40 && Math.abs(angleDiff(Math.atan2(ped.y - py, ped.x - px), aim)) < 1.1) {
      ped.health -= 55;
      if (ped.health <= 0) { ped.state = 'down'; world.onPedDown(ped, 'melee'); }
      else { ped.state = 'flee'; ped.panic = 3; ped.fleeX = px; ped.fleeY = py; world.onAssault(ped); }
    }
  }
  scarePeds(world.peds, px, py, 90);
}

export function tryShoot(state, world) {
  if (combat.fireCooldown > 0 || state.player.inCar) return;
  combat.fireCooldown = 0.22;
  combat.muzzle = 0.06;
  sfxShoot();
  const px = state.player.x, py = state.player.y, a = state.player.aimAngle;
  combat.bullets.push({ x: px + Math.cos(a) * 14, y: py + Math.sin(a) * 14, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.55 });
  scarePeds(world.peds, px, py, 240);
  world.onGunshot(px, py);
}

export function updateCombat(state, dt, world) {
  combat.swingTimer = Math.max(0, combat.swingTimer - dt);
  combat.fireCooldown = Math.max(0, combat.fireCooldown - dt);
  combat.muzzle = Math.max(0, combat.muzzle - dt);
  for (let i = combat.bullets.length - 1; i >= 0; i--) {
    const b = combat.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || hitsBuilding(b.x, b.y, 2);
    if (!dead) {
      for (const ped of world.peds) {
        if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < 10) {
          ped.health -= 70;
          if (ped.health <= 0) { ped.state = 'down'; world.onPedDown(ped, 'shot'); }
          else { ped.state = 'flee'; ped.panic = 3; ped.fleeX = state.player.x; ped.fleeY = state.player.y; }
          dead = true; break;
        }
      }
    }
    if (!dead) {
      for (const car of world.allCars()) {
        if (Math.abs(car.x - b.x) < 26 && Math.abs(car.y - b.y) < 16) { car.health -= 12; dead = true; break; }
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }
}

export function drawCombat(ctx, state) {
  // Bullets as bright tracers.
  ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2.4;
  for (const b of combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Muzzle flash at the player's hand while firing.
  if (combat.muzzle > 0 && !state.player.inCar) {
    const a = state.player.aimAngle;
    const mx = state.player.x + Math.cos(a) * 18, my = state.player.y + Math.sin(a) * 18;
    ctx.fillStyle = 'rgba(255,190,60,0.9)';
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fill();
  }
  // Melee swing arc.
  if (combat.swingTimer > 0.16 && !state.player.inCar) {
    const a = state.player.aimAngle;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 30, a - 0.7, a + 0.7); ctx.stroke();
  }
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
