// main.js — Solmar Vice: Port of Thieves. Boot, game state, the main loop, the player
// (on foot and driving), the chase camera, crime consequences, busted / wasted flow,
// pause, and the ?stage= screenshot staging hooks.
import { initInput, endFrameInput, Input, down, tapped } from './input.js';
import { generateCity, drawCity, moveWithCollision, hitsBuilding, isWater, WORLD_W, WORLD_H } from './city.js';
import { makeCar, spawnVehicles, updatePlayerCar, updateTrafficCar, collideCars, drawCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrian, drawPedestrian, scarePeds } from './pedestrians.js';
import { wanted, addHeat, resetWanted, makeCopCar, updatePoliceSpawning, updateCopCar, updateWanted, drawCopCar } from './police.js';
import { combat, resetCombat, tryMelee, tryShoot, updateCombat, drawCombat } from './combat.js';
import { missions, startMission, updateMissions, drawMissionMarker, showMessage } from './missions.js';
import { drawHUD } from './hud.js';
import { startAudio, toggleMute, setEngine, sfxDoor, sfxCrash, sfxHurt, sfxBusted } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = 1280, viewH = 720;
function resize() {
  viewW = window.innerWidth; viewH = window.innerHeight;
  canvas.width = viewW * devicePixelRatio; canvas.height = viewH * devicePixelRatio;
  canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

export const state = {
  mode: 'title', // title | playing | paused | ended
  cash: 120,
  player: null,
  cars: [], cops: [],
  peds: [],
  cam: { x: 0, y: 0 },
  missionIndex: 0, storyDone: false,
  missionCarId: 0,
  pickupVisible: false,
  spawnTimer: 0,
  saveTimer: 0,
  muted: false,
  endKind: '',
  get wantedLevel() { return wanted.level; },
  get wantedUnseen() { return wanted.unseenTime; },
  get bustProgress() { return wanted.bustTimer / 2; },
};

function makePlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, health: 100, facing: -Math.PI / 2, aimAngle: 0,
    inCar: false, car: null, speedNow: 0, legPhase: 0,
  };
}

// ---- crime & consequence callbacks (the "world" interface other modules call) ----
const world = {
  peds: state.peds,
  allCars: () => [...state.cars, ...state.cops],
  playerPos: () => state.player,
  fastCarNear(x, y, r) {
    for (const c of world.allCars()) {
      if (Math.abs(c.speed) > 170 && Math.hypot(c.x - x, c.y - y) < r) return c;
    }
    if (state.player.inCar && state.player.car && Math.abs(state.player.car.speed) > 170 &&
        Math.hypot(state.player.car.x - x, state.player.car.y - y) < r) return state.player.car;
    return null;
  },
  onCrash(car, speed) {
    if (state.player.inCar && state.player.car === car) {
      hurtPlayer(Math.min(16, speed / 30));
      if (speed > 240) { addHeat(0.5); showMessage('That crash drew attention…', 2.5); }
    }
  },
  onCarHit(a, b, impact) {
    const mine = state.player.inCar && (state.player.car === a || state.player.car === b);
    if (mine && impact > 200) {
      addHeat(0.45);
      if (b.kind === 'police' || a.kind === 'police') addHeat(0.4);
      hurtPlayer(4);
    }
  },
  onCopRam(cop, target) {
    if (state.player.inCar) { hurtPlayer(2.2); state.player.car.health -= 3; }
    else hurtPlayer(5);
  },
  onPedDown(ped, how) {
    addHeat(how === 'shot' ? 1.0 : 0.8);
    showMessage(how === 'shot' ? 'You dropped a pedestrian! The Patrulla is coming.' : 'You knocked a pedestrian down!', 3.5);
    scarePeds(state.peds, ped.x, ped.y, 200);
  },
  onAssault() { addHeat(0.35); },
  onGunshot() { addHeat(0.55); },
  onEscaped() { showMessage('You lost the police. Lay low, Rico.', 3.5); },
  onBusted() { endRun('busted'); },
  onMissionProgress() { persist(); },
};

function hurtPlayer(amount) {
  if (state.mode !== 'playing') return;
  state.player.health -= amount;
  sfxHurt();
  if (state.player.health <= 0) { state.player.health = 0; endRun('wasted'); }
}

// ---- run lifecycle ----
function newGame(fromSave) {
  generateCity();
  state.cars.length = 0; state.cops.length = 0; state.peds.length = 0;
  spawnVehicles(state.cars);
  spawnPedestrians(state.peds);
  // Tito's red Brisa Coupe for mission 2 waits on Avenida del Faro from the start.
  const tito = makeCar(806, 420, Math.PI / 2, '#e63946', 'parked');
  tito.name = 'Brisa Coupe';
  state.cars.push(tito);
  state.missionCarId = tito.id;
  resetWanted(); resetCombat();
  const save = fromSave ? loadSave() : null;
  state.cash = save ? save.cash : 120;
  state.player = makePlayer(save ? save.x : 330, save ? save.y : 380);
  state.storyDone = save ? !!save.storyDone : false;
  startMission(save ? Math.min(save.missionIndex, 3) : 0, state);
  if (state.storyDone) missions.done = true;
  state.mode = 'playing';
  hideOverlays();
  snapCamera();
  persist();
}

function endRun(kind) {
  state.endKind = kind;
  state.mode = 'ended';
  setEngine(0, false);
  const fine = kind === 'busted' ? Math.min(state.cash, 150 + wanted.level * 60) : Math.min(state.cash, 120);
  state.cash -= fine;
  if (kind === 'busted') { sfxBusted(); resetWanted(); state.cops.length = 0; }
  document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('end-text').textContent = kind === 'busted'
    ? `The Policía Portuaria pinned you. Bail and fines cost you $${fine}. You walk out of the comisaría at dawn.`
    : `You wake up at Clínica del Mar. The bill cost you $${fine}. La Gata sends flowers and more work.`;
  document.getElementById('end-screen').classList.remove('hidden');
  persist();
}

function respawn() {
  state.player.health = 100;
  state.player.inCar = false; state.player.car = null;
  state.player.x = 640; state.player.y = 1790; // outside Clínica del Mar
  resetWanted(); state.cops.length = 0;
  state.mode = 'playing';
  document.getElementById('end-screen').classList.add('hidden');
  snapCamera();
}

function persist() { if (state.player) writeSave(state); }

// ---- player ----
function updatePlayer(dt) {
  const p = state.player;
  p.aimAngle = Math.atan2(Input.mouseY - viewH / 2, Input.mouseX - viewW / 2);
  if (p.inCar) {
    const car = p.car;
    updatePlayerCar(car, {
      up: down('w', 'arrowup'), down: down('s', 'arrowdown'),
      left: down('a', 'arrowleft'), right: down('d', 'arrowright'),
      handbrake: down(' '), boost: down('shift'),
    }, dt, world);
    p.x = car.x; p.y = car.y; p.facing = car.angle;
    p.vx = Math.cos(car.angle) * car.speed; p.vy = Math.sin(car.angle) * car.speed;
    p.speedNow = Math.abs(car.speed);
    setEngine(car.speed / 430, true);
    // Running people over is a serious crime.
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.abs(car.speed) > 60 && Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
        ped.state = 'down'; ped.health = 0;
        world.onPedDown(ped, 'runover');
        sfxCrash(0.5);
        car.speed *= 0.82;
      }
    }
    if (tapped('e')) exitCar();
  } else {
    setEngine(0, false);
    const run = down('shift') ? 1.65 : 1;
    let dx = (down('d', 'arrowright') ? 1 : 0) - (down('a', 'arrowleft') ? 1 : 0);
    let dy = (down('s', 'arrowdown') ? 1 : 0) - (down('w', 'arrowup') ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    const speed = 148 * run;
    p.speedNow = (dx || dy) ? speed : 0;
    if (dx || dy) {
      p.facing = Math.atan2(dy, dx);
      p.legPhase += dt * 11 * run;
      const stepX = (dx / len) * speed * dt, stepY = (dy / len) * speed * dt;
      if (isWater(p.x + stepX, p.y + stepY)) { /* the sea is chest-deep: stop */ }
      else moveWithCollision(p, stepX, stepY, 10);
    }
    p.vx = dx * speed; p.vy = dy * speed;
    if (tapped('e')) tryEnterCar();
    if (tapped('f')) tryMelee(state, world);
    if (Input.mouseClicked || (Input.mouseDown && combat.fireCooldown <= 0)) tryShoot(state, world);
  }
}

function tryEnterCar() {
  const p = state.player;
  let best = null, bestD = 58;
  for (const c of state.cars) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (!best) return;
  const wasParked = best.kind === 'parked';
  const hadDriver = best.driver;
  best.kind = 'player'; best.driver = true;
  p.inCar = true; p.car = best; p.x = best.x; p.y = best.y;
  sfxDoor();
  if (wasParked || !hadDriver) {
    addHeat(0.55);
    showMessage(`You stole the ${best.name}! The owner is calling the Patrulla…`, 3.5);
    scarePeds(state.peds, p.x, p.y, 110);
  }
}

function exitCar() {
  const p = state.player;
  const car = p.car;
  car.kind = 'parked'; car.speed = 0;
  p.inCar = false; p.car = null;
  // Step out beside the car, nudging until there is standing room.
  for (const [ox, oy] of [[0, -30], [0, 30], [-34, 0], [34, 0]]) {
    if (!hitsBuilding(car.x + ox, car.y + oy, 10)) { p.x = car.x + ox; p.y = car.y + oy; break; }
  }
  sfxDoor();
}

// ---- camera ----
function snapCamera() {
  state.cam.x = clamp(state.player.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
  state.cam.y = clamp(state.player.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
}
function updateCamera(dt) {
  const tx = clamp(state.player.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
  const ty = clamp(state.player.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
  const k = Math.min(1, dt * 4.2);
  state.cam.x += (tx - state.cam.x) * k;
  state.cam.y += (ty - state.cam.y) * k;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---- per-frame update ----
function update(dt) {
  updatePlayer(dt);
  for (const c of state.cars) if (c.kind === 'traffic') updateTrafficCar(c, dt, world);
  collideCars([...state.cars, ...state.cops], world);
  for (const ped of state.peds) updatePedestrian(ped, dt, world);
  updatePoliceSpawning(state, dt, state.cops);
  for (const cop of state.cops) updateCopCar(cop, dt, state, world);
  updateWanted(state, dt, state.cops, world);
  updateCombat(state, dt, world);
  updateMissions(state, dt, world);
  updateCamera(dt);
  state.saveTimer -= dt;
  if (state.saveTimer <= 0) { state.saveTimer = 4; persist(); }
}

// ---- rendering ----
function draw() {
  drawCity(ctx, state.cam, viewW, viewH);
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  const t = performance.now() / 1000;
  drawMissionMarker(ctx, state, t);
  for (const c of state.cars) drawCar(ctx, c, state.player.car === c);
  for (const cop of state.cops) drawCopCar(ctx, cop);
  for (const ped of state.peds) drawPedestrian(ctx, ped, false);
  if (!state.player.inCar) drawPlayerFigure();
  drawCombat(ctx, state);
  ctx.restore();
  drawHUD(ctx, state, viewW, viewH);
}

function drawPlayerFigure() {
  const p = state.player;
  // Reuse the pedestrian renderer with the player's own body state.
  drawPedestrian(ctx, { x: p.x, y: p.y, shirt: '#ffd23f', state: 'walk', speed: p.speedNow, legPhase: p.legPhase, health: 100 }, true);
  // Aim line is subtle: a short gun arm toward the mouse.
  ctx.strokeStyle = '#2d3142'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 2);
  ctx.lineTo(p.x + Math.cos(p.aimAngle) * 15, p.y - 2 + Math.sin(p.aimAngle) * 15);
  ctx.stroke();
}

// ---- loop ----
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.mode === 'playing') {
    if (tapped('p', 'escape')) { state.mode = 'paused'; document.getElementById('pause-screen').classList.remove('hidden'); }
    if (tapped('m')) state.muted = toggleMute();
    update(dt);
  } else if (state.mode === 'paused' && tapped('p', 'escape')) {
    state.mode = 'playing'; document.getElementById('pause-screen').classList.add('hidden');
  }
  if (state.mode !== 'title') draw();
  else drawTitleBackdrop();
  endFrameInput();
}
requestAnimationFrame(frame);

function drawTitleBackdrop() {
  // The start overlay covers the screen; behind it, a slow pan over the city.
  if (!state.player) { generateCity(); state.player = makePlayer(900, 900); spawnPedestrians(state.peds); }
  state.cam.x = (Math.sin(performance.now() / 9000) * 0.5 + 0.5) * (WORLD_W - viewW);
  state.cam.y = 500 + Math.cos(performance.now() / 12000) * 160;
  drawCity(ctx, state.cam, viewW, viewH);
}

// ---- overlays & buttons ----
function hideOverlays() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
}
document.getElementById('btn-new').addEventListener('click', () => { startAudio(); clearSave(); newGame(false); });
document.getElementById('btn-continue').addEventListener('click', () => { startAudio(); newGame(true); });
document.getElementById('btn-resume').addEventListener('click', () => { state.mode = 'playing'; document.getElementById('pause-screen').classList.add('hidden'); });
document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); newGame(false); });
document.getElementById('btn-again').addEventListener('click', () => respawn());
if (!loadSave()) document.getElementById('btn-continue').style.display = 'none';

// ---- screenshot staging: ?stage=cover|onfoot|mission|chase ----
// Sets up a rich scene instantly so screenshots show several systems at once.
const stageParam = new URLSearchParams(location.search).get('stage');
if (stageParam) {
  newGame(false);
  const p = state.player;
  if (stageParam === 'onfoot') {
    p.x = 1150; p.y = 735; // on the street, a short walk from the crate at Mercado Central
    missions.banner = ''; missions.bannerTimer = 0;
    showMessage('La Gata: "Grab the crate, Rico — and watch for the Patrulla."', 30);
  } else if (stageParam === 'mission') {
    p.x = 715; p.y = 635; // sidewalk corner by Avenida del Faro
    state.pickupVisible = false;
    const car = state.cars.find((c) => c.kind === 'traffic') || state.cars[0];
    car.x = 786; car.y = 560; car.angle = Math.PI / 2;
    showMessage('La Gata: "Deliver the crate to my café — the yellow marker!"', 30);
    missions.stage = 1; missions.banner = 'M1 · A Package for La Gata'; missions.bannerTimer = 30;
  } else if (stageParam === 'chase' || stageParam === 'cover') {
    // Player mid-pursuit in a stolen coupe, traffic around, cops on the tail.
    const car = makeCar(1260, 730, 0, '#e63946', 'player');
    car.speed = 250; car.name = 'Brisa Coupe';
    state.cars.push(car);
    p.inCar = true; p.car = car; p.x = car.x; p.y = car.y;
    addHeat(3);
    for (let i = 0; i < 3; i++) {
      const c = makeCopCar(1260 - 130 - i * 90, 700 + i * 44);
      c.angle = 0; c.speed = 230;
      state.cops.push(c);
    }
    // Traffic ahead and beside for a busy street.
    const t1 = makeCar(1560, 758, 0, '#2a9d8f', 'traffic'); t1.speed = 120; state.cars.push(t1);
    const t2 = makeCar(1080, 672, Math.PI, '#f9c74f', 'traffic'); t2.speed = 110; state.cars.push(t2);
    startMission(2, state); // Harbour Dash objective on the HUD
    showMessage('The Patrulla is on you — finish the delivery or lose them!', 30);
    state.cash = 640;
  }
  snapCamera();
}

initInput(canvas);
