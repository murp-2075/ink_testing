// server.ts
import { Duplex } from "node:stream";
import { render, Box, Text, useInput } from "ink";
import React from "react";
import { type ServerWebSocket } from "bun";



/* ────────────────────────────────
   Ink UI
   ──────────────────────────────── */
   type AppProps = { rows: number; cols: number };

   const App: React.FC<AppProps> = ({ rows }) => {
     const [history, setHistory] = React.useState<string[]>([]);
     const [buffer, setBuffer]   = React.useState("");
   
     useInput((input, key) => {
       if (key.return) {
         if (buffer) {
           setHistory(h => [...h, `User: ${buffer}`, `Assistant: ${buffer}`]);
         }
         setBuffer("");
         return;
       }
       if (key.backspace || key.delete) {
         setBuffer(b => b.slice(0, -1));
         return;
       }
       setBuffer(b => b + input);
     });
   
     // show only what fits (1 line reserved for the prompt)
     const visible = history.slice(-Math.max(0, rows - 1));
  
     return (
       <Box flexDirection="column" height={rows} padding={1}>
         <Box flexDirection="column" flexGrow={1}>
           {visible.map((line, i) => (
             <Text key={i}>{line}</Text>
           ))}
         </Box>
         <Text color="yellow">{"> "}{buffer}</Text>
       </Box>
     );
   };

/* ────────────────────────────────
   WS ⇄ Ink fake-TTY shim
   ──────────────────────────────── */
function createTTY(ws: ServerWebSocket): Duplex {
  const tty = new Duplex({
    write(chunk, _enc, cb) { ws.send(chunk); cb(); },
    read() { },
  }) as Duplex & { columns: number; rows: number; isTTY: boolean };

  tty.isTTY = true;
  tty.columns = 0;   // will get real values a few ms later
  tty.rows = 0;
  tty.setRawMode = () => { };
  tty.ref = tty.unref = () => { };

  return tty;
}


/* ────────────────────────────────
   WebSocket handlers
   ──────────────────────────────── */
   function makeWebSocketHandlers() {
    return {
      perMessageDeflate: false,
  
      open(ws: ServerWebSocket) {
        const tty = createTTY(ws);
        ws.data = { tty, instance: null };
      },
  
      message(ws: ServerWebSocket, msg: string | Uint8Array | ArrayBuffer) {
        // handle resize packet (0xff …)
        const view = typeof msg === "string" ? null : new Uint8Array(msg);
        if (view && view[0] === 0xff) {
          const [c, r] = new TextDecoder()
            .decode(view.subarray(1))
            .split(",")
            .map(Number);
          ws.data.tty.columns = c;
          ws.data.tty.rows    = r;
  
          // (re)render with new size
          ws.send("\x1b[2J\x1b[H");        // clear
          ws.data.instance?.unmount();
          ws.data.instance = render(
            <App rows={r} cols={c} />,
            { stdin: ws.data.tty, stdout: ws.data.tty, exitOnCtrlC: false }
          );
          return;
        }
  
        // regular keystrokes
        const str = typeof msg === "string" ? msg : Buffer.from(msg).toString();
        ws.data.tty.push(Buffer.from(str));
      },
  
      close(ws: ServerWebSocket) { ws.data.instance?.unmount(); }
    } as const;
  }

/* ────────────────────────────────
   HTTP + WebSocket server
   ──────────────────────────────── */
Bun.serve({
  port: 3000,
  websocket: makeWebSocketHandlers(),
  routes: {
    "/": () => new Response(Bun.file("./public/index.html")),
    "/client.js": () => new Response(Bun.file("./public/client.js")),
    "/client.css": () => new Response(Bun.file("./public/client.css")),
    "/term": (req, server) =>
      server.upgrade(req) ? undefined : new Response("Not Found", { status: 404 })
  }
});

console.log("▶️  Ink server running at http://localhost:3000");
