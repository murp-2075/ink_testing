import { Duplex } from "node:stream";
import { render, Box, Text } from "ink";
import React from "react";
import { type ServerWebSocket } from "bun";

// ── Global UI state ─────────────────────────
let currentLines: string[] = [];             // history of submitted lines
let currentInput = "";                       // live input buffer
let setLines: React.Dispatch<React.SetStateAction<string[]>> | null = null;
let setInput: React.Dispatch<React.SetStateAction<string>> | null = null;

// ── Ink App component ───────────────────────
const App = () => {
  const [lines, _setLines] = React.useState<string[]>(currentLines);
  const [input, _setInput] = React.useState<string>(currentInput);

  // expose setters globally for handleInput()
  React.useEffect(() => {
    setLines = _setLines;
    setInput = _setInput;
    return () => {
      setLines = null;
      setInput = null;
    };
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row">
        <Text color="green">Welcome to Ink Terminal!</Text>
      </Box>
      <Box flexDirection="row">
        <Text color="green">Welcome to Ink Terminal!</Text>
      </Box>
      <Box flexDirection="row">
        {lines.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
        {/* prompt */}
        <Text color="yellow">&gt; {input}</Text>
      </Box>
    </Box>
  );
};

// ── Helper to process keystrokes ────────────
function handleInput(data: string) {
  // Enter: commit currentInput to history
  if (data === "\r") {
    if (currentInput.length > 0) {
      currentLines = [...currentLines, currentInput];
    }
    currentInput = "";
    setLines?.([...currentLines]);
    setInput?.(currentInput);
    return;
  }

  // Backspace
  if (data === "\x7f") {
    currentInput = currentInput.slice(0, -1);
    setInput?.(currentInput);
    return;
  }

  // Regular printable char
  currentInput += data;
  setInput?.(currentInput);
}

// ── Fake TTY util converting WS ⇄ Ink streams ─
function createTTY(ws: ServerWebSocket): Duplex {
  const tty = new Duplex({
    write(chunk, _enc, cb) {
      ws.send(chunk);          // everything Ink prints → browser
      cb();
    },
    read() {
      /* unused: push() is called manually */
    }
  });

  tty.isTTY = true;
  tty.columns = 80;
  tty.rows = 24;
  tty.setRawMode = () => { };
  tty.ref = () => { };
  tty.unref = () => { };

  return tty;
}

// ── WebSocket <-> Ink orchestration ─────────
function makeWebSocketHandlers() {
  return {
    perMessageDeflate: false,
    open(ws: ServerWebSocket) {
      const tty = createTTY(ws);
      // mount Ink after first resize so columns/rows match
      ws.data = { tty, instance: null };
    },
    message(ws: ServerWebSocket, msg: string | Buffer) {
      // Resize events arrive as JSON objects
      try {
        const evt = JSON.parse(msg.toString());
        if (evt.type === "resize") {
          ws.data.tty.columns = evt.cols;
          ws.data.tty.rows = evt.rows;
          if (ws.data.instance) {
            ws.data.instance.rerender();
          } else {
            ws.data.instance = render(<App />, {
              stdin: ws.data.tty,
              stdout: ws.data.tty,
              exitOnCtrlC: false
            });
          }
          return;
        }
      } catch {/* not JSON → treat as keystroke data */ }

      // Forward bytes to Ink & handle echo widget
      const str = typeof msg === "string" ? msg : Buffer.from(msg).toString("utf8");
      handleInput(str);
      ws.data.tty.push(Buffer.from(str)); // let Ink think it’s stdin too (optional)
    },
    close(ws: ServerWebSocket) {
      ws.data.instance?.unmount();
    }
  } satisfies Parameters<typeof Bun.serve>[0]["websocket"];
}

// ── HTTP + WS server ────────────────────────
Bun.serve({
  port: 3000,
  websocket: makeWebSocketHandlers(),
  routes: {
    "/": () => new Response(Bun.file("./public/index.html")),
    "/client.js": () => new Response(Bun.file("./public/client.js")),
    "/client.css": () => new Response(Bun.file("./public/client.css")),
    "/term": (req, server) => (server.upgrade(req) ? undefined : new Response("Not Found", { status: 404 }))
  }
});

console.log("▶️  Ink server with line‑echo running at http://localhost:3000");