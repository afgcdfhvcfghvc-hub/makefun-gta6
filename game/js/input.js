// input.js — keyboard and mouse state for Solmar Vice.
// One shared Input object: held keys, edge-triggered presses, and mouse aim in screen space.
export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  mouseClicked: false,
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!Input.keys.has(k)) Input.pressed.add(k);
    Input.keys.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => Input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { Input.keys.clear(); Input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    Input.mouseX = e.clientX - r.left;
    Input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { Input.mouseDown = true; Input.mouseClicked = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) Input.mouseDown = false; });
}

// Call once per frame after the game logic has consumed the edge triggers.
export function endFrameInput() {
  Input.pressed.clear();
  Input.mouseClicked = false;
}

export function down(...names) { return names.some((n) => Input.keys.has(n)); }
export function tapped(...names) { return names.some((n) => Input.pressed.has(n)); }
