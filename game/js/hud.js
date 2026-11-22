// hud.js — everything drawn over the world: health, cash, wanted stars, the mission
// objective banner, toasts, the busted meter, and the canvas minimap (roads, beach,
// player, traffic, police and the mission marker).
import { AVENUES, STREETS, ROAD_W, WORLD_W, WORLD_H, BEACH_Y, WATER_Y } from './city.js';
import { objectiveText, missions, currentStage } from './missions.js';

export function drawHUD(ctx, state, viewW, viewH) {
  // Top-left: health bar + cash.
  ctx.fillStyle = 'rgba(8,10,22,0.62)';
  roundPanel(ctx, 14, 14, 232, 64, 10);
  ctx.fillStyle = '#ff5d5d';
  ctx.fillRect(26, 28, 160, 13);
  ctx.fillStyle = '#57e389';
  ctx.fillRect(26, 28, 160 * Math.max(0, state.player.health) / 100, 13);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(26, 28, 160, 13);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Trebuchet MS, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('RICO', 26, 24);
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 19px Trebuchet MS, sans-serif';
  ctx.fillText(`$${state.cash}`, 26, 68);
  ctx.fillStyle = '#9be7ff'; ctx.font = '12px Trebuchet MS, sans-serif';
  ctx.fillText(state.player.inCar ? `🚗 ${state.player.car ? state.player.car.name : ''}` : 'on foot', 96, 68);

  drawStars(ctx, state, viewW);
  drawObjective(ctx, state, viewW);
  drawMinimap(ctx, state, viewW, viewH);

  if (missions.bannerTimer > 0) {
    ctx.fillStyle = 'rgba(8,10,22,0.55)';
    roundPanel(ctx, viewW / 2 - 330, viewH * 0.2 - 34, 660, 62, 12);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 27px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(missions.banner, viewW / 2, viewH * 0.2 + 8);
  }
  if (state.bustProgress > 0.02) {
    ctx.fillStyle = 'rgba(8,10,22,0.6)';
    roundPanel(ctx, viewW / 2 - 130, viewH - 120, 260, 44, 9);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POLICE ARE PINNING YOU — MOVE!', viewW / 2, viewH - 104);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(viewW / 2 - 110, viewH - 96, 220 * Math.min(1, state.bustProgress), 8);
  }
  if (state.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px Trebuchet MS, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('🔇 muted (M)', viewW - 16, viewH - 12);
  }
}

function drawStars(ctx, state, viewW) {
  const lvl = state.wantedLevel;
  ctx.font = '30px Trebuchet MS, sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < lvl ? '#ffd23f' : 'rgba(255,255,255,0.28)';
    ctx.fillText('★', viewW - 18 - (4 - i) * 30, 44);
  }
  if (lvl > 0 && state.wantedUnseen > 5) {
    ctx.fillStyle = '#9be7ff'; ctx.font = 'bold 12px Trebuchet MS, sans-serif';
    ctx.fillText('losing them…', viewW - 18, 64);
  }
}

function drawObjective(ctx, state, viewW) {
  const text = objectiveText();
  ctx.font = 'bold 15px Trebuchet MS, sans-serif';
  const w = Math.min(viewW - 340, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(8,10,22,0.62)';
  roundPanel(ctx, viewW / 2 - w / 2, 12, w, 34, 9);
  ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center';
  ctx.fillText(text, viewW / 2, 35);
  if (missions.messageTimer > 0 && missions.message) {
    ctx.font = 'italic 14px Trebuchet MS, sans-serif';
    const mw = Math.min(viewW - 120, ctx.measureText(missions.message).width + 26);
    ctx.fillStyle = 'rgba(8,10,22,0.55)';
    roundPanel(ctx, viewW / 2 - mw / 2, 52, mw, 30, 8);
    ctx.fillStyle = '#d8f4ff';
    ctx.fillText(missions.message, viewW / 2, 72);
  }
  // Off-screen direction arrow toward the marker.
  const s = currentStage();
  if (s && s.need !== 'escape') {
    const dx = s.x - state.player.x, dy = s.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d > 60) {
      const a = Math.atan2(dy, dx);
      const cx = viewW / 2, cy = 120;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(d / 10)}m`, cx, cy + 26);
    }
  }
}

const MAP_W = 216, MAP_H = 162;
function drawMinimap(ctx, state, viewW, viewH) {
  const mx = viewW - MAP_W - 14, my = viewH - MAP_H - 14;
  const sx = MAP_W / WORLD_W, sy = MAP_H / WORLD_H;
  ctx.fillStyle = 'rgba(10,14,26,0.78)';
  roundPanel(ctx, mx - 4, my - 4, MAP_W + 8, MAP_H + 8, 10);
  ctx.save();
  ctx.beginPath(); ctx.rect(mx, my, MAP_W, MAP_H); ctx.clip();
  ctx.fillStyle = '#c9b18c'; ctx.fillRect(mx, my, MAP_W, MAP_H);
  ctx.fillStyle = '#eed9a0'; ctx.fillRect(mx, my + BEACH_Y * sy, MAP_W, (WATER_Y - BEACH_Y) * sy);
  ctx.fillStyle = '#2b7fb8'; ctx.fillRect(mx, my + WATER_Y * sy, MAP_W, MAP_H - WATER_Y * sy);
  ctx.strokeStyle = '#4a4a52'; ctx.lineWidth = Math.max(2, ROAD_W * sx);
  for (const a of AVENUES) { ctx.beginPath(); ctx.moveTo(mx + a * sx, my); ctx.lineTo(mx + a * sx, my + BEACH_Y * sy); ctx.stroke(); }
  for (const s of STREETS) { ctx.beginPath(); ctx.moveTo(mx, my + s * sy); ctx.lineTo(mx + MAP_W, my + s * sy); ctx.stroke(); }
  // Traffic dots.
  ctx.fillStyle = '#e8e8e8';
  for (const c of state.cars) ctx.fillRect(mx + c.x * sx - 1.5, my + c.y * sy - 1.5, 3, 3);
  // Police: flashing blue/red dots.
  const flash = Math.floor(performance.now() / 280) % 2 === 0;
  for (const c of state.cops) {
    ctx.fillStyle = flash ? '#ff4040' : '#4d7cff';
    ctx.beginPath(); ctx.arc(mx + c.x * sx, my + c.y * sy, 3.4, 0, 7); ctx.fill();
  }
  // Mission marker.
  const s = currentStage();
  if (s && s.need !== 'escape') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(mx + s.x * sx, my + s.y * sy, 4.6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(mx + s.x * sx, my + s.y * sy, 7 + Math.sin(performance.now() / 300) * 1.6, 0, 7); ctx.stroke();
  }
  // Player arrow.
  const px = mx + state.player.x * sx, py = my + state.player.y * sy;
  ctx.save(); ctx.translate(px, py); ctx.rotate(state.player.facing);
  ctx.fillStyle = '#ff5d8f';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 10px Trebuchet MS, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('PUERTO SOLMAR', mx + MAP_W, my - 8);
}

function roundPanel(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
