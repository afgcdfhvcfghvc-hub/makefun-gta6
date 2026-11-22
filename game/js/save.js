// save.js — localStorage persistence: cash, story progress and player position.
const SAVE_KEY = 'solmar-vice-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
    }));
  } catch {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}

export function hasSave() { return loadSave() !== null; }
