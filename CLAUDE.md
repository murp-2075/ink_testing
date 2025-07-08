# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `bun install` - Install dependencies
- `bun run dev` - Start development server (runs both client build and server)
- `bun run server` - Start server only with hot reload
- `bun run client` - Build client with watch mode
- `bun src/server.tsx` - Run server directly

## Architecture

This is a web-based terminal application that renders React Ink components in the browser using xterm.js. The architecture consists of:

### Server Side (src/server.tsx)
- **Bun.serve()** with WebSocket support on port 3000
- **React Ink** components for terminal UI rendering
- **TTY simulation** via Node.js Duplex streams to bridge WebSocket ↔ Ink
- **Static file serving** for HTML, CSS, and bundled JavaScript

### Client Side (src/client.ts)
- **xterm.js** terminal emulator with FitAddon for responsive sizing
- **WebSocket connection** to `/term` endpoint for real-time communication
- **Keyboard input handling** with fallback mechanisms for focus issues
- **Resize handling** that sends terminal dimensions to server

### Key Integration Points
- `createTTY()` function converts Bun ServerWebSocket into a fake TTY stream
- Server renders Ink components with the fake TTY as stdin/stdout
- Client sends keystrokes as WebSocket messages, receives terminal output
- Resize events are JSON-encoded and handled separately from keystroke data

## Bun-Specific Usage

- Use `bun build` for client-side bundling (configured in package.json scripts)
- Server uses `Bun.serve()` with routes and WebSocket handlers
- Static files served via `Bun.file()` 
- Hot reload enabled with `--watch` flag

## Dependencies

- **@xterm/xterm** + **@xterm/addon-fit** - Browser terminal emulator
- **ink** - React for CLI rendering
- **react** - UI library (used by Ink)

The project demonstrates bridging server-side CLI React components with browser-based terminal interaction.
