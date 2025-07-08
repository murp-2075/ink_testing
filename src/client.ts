// src/client.ts
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";          // Bun’s CSS bundler understands this

const term = new Terminal({ convertEol: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

// Centralized focus helper: xterm.focus() + hidden textarea fallback
function focusTerm() {
  term.focus();
  const ta = termElement.querySelector('textarea');
  if (ta) ta.focus();
}

const termElement = document.getElementById('term')!;
term.open(termElement);
// Initial focus attempt
focusTerm();
// Auto-focus on load as a fallback
window.addEventListener('load', () => setTimeout(focusTerm, 0));
// Re-focus on any pointer interaction
termElement.addEventListener('pointerdown', focusTerm);
// As a fallback, focus on first key press anywhere
document.addEventListener('keydown', focusTerm, { once: true });

// Fit the terminal to the container size
function fitTerminal() {
  fitAddon.fit();
}

// Initial fit
setTimeout(fitTerminal, 10);
const ws = new WebSocket(`ws://${location.host}/term`);
ws.binaryType = "arraybuffer";

// client.ts
const decoder = new TextDecoder();

// … everything up to .onmessage stays the same
ws.onmessage = ev => {
  const text = typeof ev.data === "string"
    ? ev.data
    : decoder.decode(ev.data);

  if (text.length > 0) {
    console.log('Received from server:', JSON.stringify(text));
  }
  term.write(text);
};


term.onData(d => {
  ws.send(d);
});

function sendResize() {
  const cols = term.cols;
  const rows = term.rows;
  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
ws.onopen = () => {
  // Send resize with a small delay to ensure server is ready
  setTimeout(sendResize, 10);
};
window.addEventListener("resize", () => {
  fitTerminal();
  clearTimeout((window as any).__resizeTimer);
  (window as any).__resizeTimer = setTimeout(sendResize, 10);
});

// Fallback for plain keys if xterm textarea isn't focused: intercept simple chars only
window.addEventListener('keydown', ev => {
  // Skip modified keys so browser shortcuts (e.g. Ctrl+R) work
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  let data: string;
  if (ev.key === 'Enter') {
    data = '\r';
  } else if (ev.key === 'Backspace') {
    data = '\x7f';
  } else if (ev.key.length === 1) {
    data = ev.key;
  } else {
    return;
  }
  ws.send(data);
  ev.stopPropagation();
  ev.preventDefault();
}, { capture: true });

