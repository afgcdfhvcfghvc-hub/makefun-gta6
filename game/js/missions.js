// missions.js — La Gata's story chain: four jobs across Puerto Solmar.
// Each mission is a list of stages; a stage completes when the player reaches its marker
// (sometimes in a car, sometimes on foot, once against the clock, once while hot).
// Markers are world points the HUD minimap and the on-screen arrow both point to.
import { addHeat } from './police.js';
import { sfxCash, sfxMissionDone, sfxPickup } from './audio.js';

export const STORY = [
  {
    title: 'M1 · A Package for La Gata',
    intro: 'La Gata: "Rico! A crate fell off a truck near the marina market. Grab it and bring it to my café."',
    stages: [
      { text: 'Reach the dropped crate at Mercado Central', x: 1210, y: 660, need: 'foot', radius: 46, pickup: true },
      { text: 'Deliver the crate to Café Limonero (La Gata)', x: 350, y: 330, need: 'any', radius: 52 },
    ],
    reward: 250,
  },
  {
    title: 'M2 · Hot Wheels for Tito',
    intro: 'La Gata: "Tito needs a fast coupe — the red Brisa on Avenida del Faro. Steal it, deliver it, don\'t scratch it."',
    stages: [
      { text: 'Steal the red Brisa Coupe on Avenida del Faro', x: 800, y: 420, need: 'specificCar', radius: 60 },
      { text: 'Deliver the coupe to Tito\'s workshop (Taller Ruiz)', x: 2250, y: 1180, need: 'car', radius: 60 },
    ],
    reward: 400,
  },
  {
    title: 'M3 · Harbour Dash',
    intro: 'La Gata: "Medicine for the clinic, fast — the ferry leaves in 90 seconds. Floor it, Rico!"',
    stages: [
      { text: 'Pick up the medicine at Farmacia Serena', x: 1770, y: 1150, need: 'any', radius: 52, pickup: true },
      { text: 'Race to Clínica del Mar before the timer runs out!', x: 330, y: 1580, need: 'any', radius: 58, timer: 90 },
    ],
    reward: 550,
  },
  {
    title: 'M4 · Port of Thieves',
    intro: 'La Gata: "The port ledger is in that armoured van route — grab the cash drop at the pier, then LOSE the police and reach the safehouse."',
    stages: [
      { text: 'Grab the cash drop at the pier warehouse', x: 2730, y: 2180, need: 'any', radius: 54, pickup: true, crime: 3 },
      { text: 'Lose the Policía Portuaria (wanted level to zero)', x: 0, y: 0, need: 'escape', radius: 0 },
      { text: 'Reach the safehouse in the old town', x: 340, y: 1990, need: 'any', radius: 56 },
    ],
    reward: 900,
  },
];

export const missions = {
  index: 0,       // which STORY entry is active
  stage: 0,       // which stage inside it
  timer: 0,       // seconds left on a timed stage (0 = untimed)
  banner: '',     // big centre-screen text
  bannerTimer: 0,
  message: '',    // smaller toast under the objective
  messageTimer: 0,
  done: false,    // whole story finished
};

export function currentMission() { return missions.done ? null : STORY[missions.index]; }
export function currentStage() {
  const m = currentMission();
  return m ? m.stages[missions.stage] : null;
}
export function objectiveText() {
  const m = currentMission();
  if (!m) return 'Story complete — Puerto Solmar is yours. Free roam!';
  const s = currentStage();
  let t = `${m.title} — ${s.text}`;
  if (missions.timer > 0) t += `  ⏱ ${Math.ceil(missions.timer)}s`;
  return t;
}

export function startMission(i, state) {
  missions.index = i; missions.stage = 0; missions.done = false;
  const m = STORY[i];
  missions.banner = m.title; missions.bannerTimer = 3.4;
  missions.message = m.intro; missions.messageTimer = 7;
  armStage(state);
}

function armStage(state) {
  const s = currentStage();
  missions.timer = s && s.timer ? s.timer : 0;
  if (s && s.crime) addHeat(s.crime);
  if (s && s.pickup) state.pickupVisible = true;
}

export function showMessage(text, seconds = 4) { missions.message = text; missions.messageTimer = seconds; }

// Per-frame mission logic: marker checks, the timed stage, and story progression.
export function updateMissions(state, dt, world) {
  missions.bannerTimer = Math.max(0, missions.bannerTimer - dt);
  missions.messageTimer = Math.max(0, missions.messageTimer - dt);
  const s = currentStage();
  if (!s) return;
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      showMessage('Too slow! La Gata sends you back to try the run again.', 5);
      missions.stage = 0;
      armStage(state);
      return;
    }
  }
  if (s.need === 'escape') {
    if (state.wantedLevel === 0) completeStage(state, world);
    return;
  }
  const d = Math.hypot(state.player.x - s.x, state.player.y - s.y);
  if (d > s.radius) return;
  if (s.need === 'foot' && state.player.inCar) { showMessage('Get out of the car to grab it. (E)', 1.2); return; }
  if (s.need === 'car' && !state.player.inCar) { showMessage('You need to arrive in a car.', 1.2); return; }
  if (s.need === 'specificCar') {
    if (!state.player.inCar || !state.player.car || state.player.car.id !== state.missionCarId) {
      showMessage('That is not Tito\'s red Brisa Coupe — find the marked car.', 1.2);
      return;
    }
  }
  if (s.pickup) { sfxPickup(); state.pickupVisible = false; showMessage('Picked it up! Keep moving.', 3); }
  completeStage(state, world);
}

function completeStage(state, world) {
  const m = currentMission();
  missions.stage++;
  if (missions.stage < m.stages.length) { armStage(state); return; }
  // Mission complete: pay out and roll into the next job.
  state.cash += m.reward;
  sfxCash(); sfxMissionDone();
  missions.banner = `MISSION COMPLETE  +$${m.reward}`;
  missions.bannerTimer = 3.4;
  if (missions.index + 1 < STORY.length) {
    startMission(missions.index + 1, state);
    missions.banner = `MISSION COMPLETE  +$${m.reward}`;
    missions.bannerTimer = 3.4;
  } else {
    missions.done = true;
    missions.banner = 'STORY COMPLETE — PORT OF THIEVES';
    missions.bannerTimer = 5;
    showMessage('You own the port now, Rico. Free roam: steal, race, and stay ahead of the Patrulla.', 8);
  }
  world.onMissionProgress();
}

// Draws the floating marker column + ring at the active stage target.
export function drawMissionMarker(ctx, state, time) {
  const s = currentStage();
  if (!s || s.need === 'escape') return;
  const bob = Math.sin(time * 3) * 6;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(0, 0, s.radius * 0.62, s.radius * 0.3, 0, 0, 7); ctx.stroke();
  const grad = ctx.createLinearGradient(0, -120, 0, 0);
  grad.addColorStop(0, 'rgba(255,210,63,0)');
  grad.addColorStop(1, 'rgba(255,210,63,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(-7, -120, 14, 120);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(0, -52 + bob); ctx.lineTo(-13, -78 + bob); ctx.lineTo(13, -78 + bob);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  if (state.pickupVisible) drawPickupCrate(ctx, s.x, s.y, time);
}

function drawPickupCrate(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 2.4) * 2);
  ctx.fillStyle = '#8a5a33'; ctx.fillRect(-13, -10, 26, 20);
  ctx.strokeStyle = '#5e3c1e'; ctx.lineWidth = 2; ctx.strokeRect(-13, -10, 26, 20);
  ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
  ctx.restore();
}
