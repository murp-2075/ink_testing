// server.ts
import { Duplex } from "node:stream";
import { render, Box, Text, useInput } from "ink";
import React from "react";
import { type ServerWebSocket } from "bun";

/* ────────────────────────────────
   Ink UI
   ──────────────────────────────── */
const App: React.FC = () => {
  const [history, setHistory] = React.useState<string[]>([]);
  const [buffer, setBuffer]   = React.useState("");

  // full-featured line editing comes from Ink itself
  useInput((input, key) => {
    if (key.return) {
      if (buffer) setHistory(h => [...h, buffer]);
      setBuffer("");
      return;
    }
    if (key.backspace || key.delete) {
      setBuffer(b => b.slice(0, -1));
      return;
    }
    setBuffer(b => b + input);
  });

  return (
    <Box flexDirection="column" padding={1}>
      {history.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Text color="yellow">{"> "}{buffer}</Text>
    </Box>
  );
};

/* ────────────────────────────────
   WS ⇄ Ink fake-TTY shim
   ──────────────────────────────── */
function createTTY(ws: ServerWebSocket): Duplex {
  const tty = new Duplex({
    write(chunk, _enc, cb) {
      ws.send(chunk); // anything Ink prints → browser
      cb();
    },
    read() {}         // Ink pushes stdin manually via tty.push()
  });

  // minimal TTY façade
  tty.isTTY      = true;
  tty.columns    = 80;
  tty.rows       = 24;
  tty.setRawMode = () => {};
  tty.ref        = () => {};
  tty.unref      = () => {};

  return tty;
}

/* ────────────────────────────────
   helpers
   ──────────────────────────────── */
function parseResize(buf: Uint8Array) {
  if (buf[0] !== 0xff) return null;
  const [colStr, rowStr] = new TextDecoder().decode(buf.subarray(1)).split(",");
  return { cols: +colStr, rows: +rowStr };
}

/* ────────────────────────────────
   WebSocket handlers
   ──────────────────────────────── */
function makeWebSocketHandlers() {
  return {
    perMessageDeflate: false,

    open(ws: ServerWebSocket) {
      const tty = createTTY(ws);
      ws.data = { tty, instance: render(<App />, {
        stdin:  tty,
        stdout: tty,
        exitOnCtrlC: false
      }) };
    },

    message(ws: ServerWebSocket, msg: string | Buffer | ArrayBuffer | Uint8Array) {
      // 1️⃣  handle browser-side resize packets
      if (typeof msg !== "string") {
        const view = msg instanceof Uint8Array ? msg : new Uint8Array(msg);
        const resize = parseResize(view);
        if (resize) {
          ws.data.tty.columns = resize.cols;
          ws.data.tty.rows    = resize.rows;

          // clear screen & remount for clean re-layout
          ws.send("\x1b[2J\x1b[H");
          ws.data.instance.unmount();
          ws.data.instance = render(<App />, {
            stdin:  ws.data.tty,
            stdout: ws.data.tty,
            exitOnCtrlC: false
          });
          return;
        }
      }

      // 2️⃣  regular keystrokes → Ink stdin
      const str = typeof msg === "string"
        ? msg
        : Buffer.from(msg).toString("utf8");

      ws.data.tty.push(Buffer.from(str));
    },

    close(ws: ServerWebSocket) {
      ws.data.instance?.unmount();
    }
  } as const;
}

/* ────────────────────────────────
   HTTP + WebSocket server
   ──────────────────────────────── */
Bun.serve({
  port: 3000,
  websocket: makeWebSocketHandlers(),
  routes: {
    "/":          () => new Response(Bun.file("./public/index.html")),
    "/client.js": () => new Response(Bun.file("./public/client.js")),
    "/client.css":() => new Response(Bun.file("./public/client.css")),
    "/term": (req, server) =>
      server.upgrade(req) ? undefined : new Response("Not Found", { status: 404 })
  }
});

console.log("▶️  Ink server running at http://localhost:3000");
