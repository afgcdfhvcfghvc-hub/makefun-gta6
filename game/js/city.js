// city.js — Puerto Solmar: map generation (road grid, blocks, buildings, beach) and rendering.
// The world is 3360 x 2520 px. Vertical avenues and horizontal streets form the grid; the
// southern strip is Playa Serena (sand, then water). Buildings sit inside blocks and collide.
export const WORLD_W = 3360;
export const WORLD_H = 2520;
export const ROAD_W = 118;
export const BEACH_Y = 2140;   // sand starts here
export const WATER_Y = 2330;   // water starts here (impassable on foot, cars stall)

export const AVENUES = [300, 780, 1260, 1740, 2220, 2700, 3120];   // vertical road centres
export const STREETS = [280, 700, 1120, 1540, 1960];               // horizontal road centres

const BUILDING_COLORS = ['#e8b04b', '#d97742', '#c95d63', '#7fb3b0', '#e6d3a3', '#b08968', '#8ecae6', '#f4a261', '#a7c4a0', '#e07a5f'];
const ROOF_COLORS = ['#9c6644', '#7f5539', '#6c5849', '#5e503f', '#86592d'];

export const city = {
  buildings: [],   // {x,y,w,h,color,roof,name}
  palms: [],       // {x,y,s} decorative, no collision except trunk point handled loosely
  lamps: [],       // {x,y}
  benches: [],     // {x,y}
  hydrants: [],    // {x,y}
};

let seed = 1234567;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

const BLOCK_NAMES = ['Hotel Brisa', 'Café Limonero', 'Banco del Puerto', 'Clínica del Mar', 'Mercado Central',
  'Torre Coral', 'Apartamentos Alba', 'Joyeria Sol', 'Teatro Brisa', 'Oficinas Marea', 'Gimnasio Ola',
  'Librería Faro', 'Hotel Miramar', 'Pensión Gaviota', 'Taller Ruiz', 'Farmacia Serena', 'Casino Perla'];

export function generateCity() {
  city.buildings.length = 0; city.palms.length = 0; city.lamps.length = 0;
  city.benches.length = 0; city.hydrants.length = 0;
  let nameIdx = 0;
  // Blocks are the rectangles between neighbouring roads.
  const xs = [60, ...AVENUES, WORLD_W - 40];
  const ys = [60, ...STREETS, BEACH_Y - 30];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const bx = xs[i] + ROAD_W / 2 + 14, by = ys[j] + ROAD_W / 2 + 14;
      const bw = xs[i + 1] - xs[i] - ROAD_W - 28, bh = ys[j + 1] - ys[j] - ROAD_W - 28;
      if (bw < 120 || bh < 100) continue;
      // One or two buildings per block, with a small plaza gap now and then.
      const two = rand() < 0.45;
      const mk = (x, y, w, h) => city.buildings.push({
        x, y, w, h, color: pick(BUILDING_COLORS), roof: pick(ROOF_COLORS),
        name: nameIdx < BLOCK_NAMES.length ? BLOCK_NAMES[nameIdx++] : '',
        floors: 2 + Math.floor(rand() * 5),
      });
      if (two) {
        const w1 = bw * (0.38 + rand() * 0.1);
        mk(bx, by, w1, bh); mk(bx + w1 + 22, by, bw - w1 - 22, bh);
      } else if (rand() < 0.12) {
        mk(bx + bw * 0.2, by + bh * 0.2, bw * 0.6, bh * 0.6); // plaza block: lone building
      } else {
        mk(bx, by, bw, bh);
      }
    }
  }
  // Palms line the beach and sprinkle the sidewalks; lamps sit on street corners.
  for (let x = 90; x < WORLD_W - 60; x += 130 + rand() * 90) city.palms.push({ x, y: BEACH_Y + 50 + rand() * 90, s: 0.8 + rand() * 0.5 });
  for (let i = 0; i < 46; i++) city.palms.push({ x: 80 + rand() * (WORLD_W - 160), y: 120 + rand() * (BEACH_Y - 240), s: 0.7 + rand() * 0.4 });
  for (const ax of AVENUES) for (const sy of STREETS) {
    city.lamps.push({ x: ax - ROAD_W / 2 - 8, y: sy - ROAD_W / 2 - 8 });
    city.lamps.push({ x: ax + ROAD_W / 2 + 8, y: sy + ROAD_W / 2 + 8 });
  }
  for (let i = 0; i < 26; i++) city.benches.push({ x: 100 + rand() * (WORLD_W - 200), y: BEACH_Y + 20 + rand() * 130 });
  for (let i = 0; i < 30; i++) city.hydrants.push({ x: 90 + rand() * (WORLD_W - 180), y: 110 + rand() * (BEACH_Y - 220) });
}

export function isRoad(x, y) {
  if (y >= BEACH_Y) return false;
  for (const a of AVENUES) if (Math.abs(x - a) < ROAD_W / 2) return true;
  for (const s of STREETS) if (Math.abs(y - s) < ROAD_W / 2) return true;
  return false;
}
export function isWater(x, y) { return y >= WATER_Y; }
export function isSand(x, y) { return y >= BEACH_Y && y < WATER_Y; }

// Circle vs. building rectangles; returns true when the circle overlaps any building.
export function hitsBuilding(x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}
// Slide-friendly move: try X then Y separately so the player hugs walls instead of sticking.
export function moveWithCollision(ent, dx, dy, r) {
  if (!hitsBuilding(ent.x + dx, ent.y, r)) ent.x += dx;
  if (!hitsBuilding(ent.x, ent.y + dy, r)) ent.y += dy;
  ent.x = Math.max(16, Math.min(WORLD_W - 16, ent.x));
  ent.y = Math.max(16, Math.min(WORLD_H - 10, ent.y));
}

function drawBuilding(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
  // Window grid hints the height (floors).
  ctx.fillStyle = 'rgba(255,240,190,0.5)';
  const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 26));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if ((i * 7 + j * 13 + b.floors) % 3 === 0) ctx.fillRect(b.x + 12 + i * 24, b.y + 12 + j * 24, 9, 9);
  }
  if (b.name) {
    ctx.fillStyle = 'rgba(20,16,10,0.75)';
    ctx.font = 'bold 11px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }
}

export function drawCity(ctx, cam, viewW, viewH) {
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + viewW, y1 = cam.y + viewH;
  // Ground: warm pavement for blocks.
  ctx.fillStyle = '#c9b18c';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  // Sand + water bands.
  ctx.fillStyle = '#eed9a0';
  ctx.fillRect(0, BEACH_Y, WORLD_W, WATER_Y - BEACH_Y);
  const grad = ctx.createLinearGradient(0, WATER_Y, 0, WORLD_H);
  grad.addColorStop(0, '#3ec6d8'); grad.addColorStop(1, '#1668a8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const wy = WATER_Y + 18 + i * 22 + Math.sin((performance.now() / 900) + i) * 3;
    ctx.beginPath(); ctx.moveTo(Math.max(0, x0), wy); ctx.lineTo(Math.min(WORLD_W, x1), wy); ctx.stroke();
  }
  // Sidewalks: pale bands around every road.
  ctx.fillStyle = '#ddd3bd';
  for (const a of AVENUES) ctx.fillRect(a - ROAD_W / 2 - 12, 0, ROAD_W + 24, BEACH_Y);
  for (const s of STREETS) ctx.fillRect(0, s - ROAD_W / 2 - 12, WORLD_W, ROAD_W + 24);
  // Asphalt.
  ctx.fillStyle = '#4a4a52';
  for (const a of AVENUES) ctx.fillRect(a - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
  for (const s of STREETS) ctx.fillRect(0, s - ROAD_W / 2, WORLD_W, ROAD_W);
  // Centre dashes.
  ctx.fillStyle = '#f7d154';
  for (const a of AVENUES) for (let y = 8; y < BEACH_Y; y += 44) ctx.fillRect(a - 2, y, 4, 24);
  for (const s of STREETS) for (let x = 8; x < WORLD_W; x += 44) ctx.fillRect(x, s - 2, 24, 4);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,240,0.65)';
  for (const a of AVENUES) for (const s of STREETS) {
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(a - ROAD_W / 2 + 4, s + i * 16 - 4, 14, 8);
      ctx.fillRect(a + ROAD_W / 2 - 18, s + i * 16 - 4, 14, 8);
    }
  }
  // Buildings (culled to view).
  for (const b of city.buildings) {
    if (b.x + b.w < x0 - 40 || b.x > x1 + 40 || b.y + b.h < y0 - 40 || b.y > y1 + 40) continue;
    drawBuilding(ctx, b);
  }
  // Props: lamps, hydrants, benches, palms.
  ctx.fillStyle = '#5b5b66';
  for (const l of city.lamps) { if (l.x > x0 - 20 && l.x < x1 + 20 && l.y > y0 - 20 && l.y < y1 + 20) { ctx.beginPath(); ctx.arc(l.x, l.y, 4, 0, 7); ctx.fill(); } }
  ctx.fillStyle = '#d64545';
  for (const h of city.hydrants) { if (h.x > x0 - 20 && h.x < x1 + 20 && h.y > y0 - 20 && h.y < y1 + 20) ctx.fillRect(h.x - 3, h.y - 3, 6, 6); }
  ctx.fillStyle = '#8a5a33';
  for (const b of city.benches) ctx.fillRect(b.x - 10, b.y - 4, 20, 8);
  for (const p of city.palms) {
    if (p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(p.x + 5, p.y + 6, 14 * p.s, 6 * p.s, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 12 * p.s); ctx.stroke();
    ctx.strokeStyle = '#2e9e5b'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath(); ctx.moveTo(p.x + 3, p.y - 12 * p.s);
      ctx.lineTo(p.x + 3 + Math.cos(a) * 15 * p.s, p.y - 12 * p.s + Math.sin(a) * 7 * p.s + 4); ctx.stroke();
    }
  }
  ctx.restore();
}
