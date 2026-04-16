# Quiz Arena

A real-time multiplayer quiz game designed as the final engagement dynamic of a presentation. Players move their characters into answer zones before time runs out — get it wrong and you're eliminated!

## How It Works

1. **Join** — Players open the URL on their phone or laptop and enter a nickname.
2. **Lobby** — Everyone spawns at the center. Move around freely, bump into each other, jump around.
3. **Question** — The presenter sends a question with 4 options (A/B/C/D), each mapped to a colored zone on the arena.
4. **Move!** — Players rush to the zone they think is correct. Push, stomp, and shove opponents out of the way.
5. **Reveal** — Timer expires (or the presenter forces it). Players in the wrong zone are eliminated.
6. **Repeat** — Next question. Last players standing win!

## Features

- **Server-authoritative physics** — 20 Hz game loop with collision, jumping, stomping, and push mechanics
- **Mobile-friendly** — touch joystick + jump button with full multitouch support
- **Bot players** — AI-controlled bots for testing or filling the arena
- **Question bank** — editable list with localStorage persistence and reset-to-defaults
- **Admin panel** — start questions, force reveal, reset game, manage bots
- **QR code sharing** — one-tap share modal for quick joins
- **Chat bubbles** — short messages appear above characters
- **Score tracking** — correct answers tracked per player across the session
- **Procedural SFX** — Web Audio API sound effects

## Tech Stack

- **Server**: Node.js, Express, Socket.IO, TypeScript
- **Client**: Vite, TypeScript, Phaser 3
- **Monorepo**: npm workspaces (`server/` + `client/`)

## Quick Start

```bash
# Install dependencies
npm install

# Run in development (server + client concurrently)
npm run dev

# Players:  http://localhost:5173
# Admin:    http://localhost:5173?admin=1
```

## Production

```bash
npm run build
npm start
```

The client builds to `client/dist/` and is served as static files by Express on port 3000.

## Admin Panel

Add `?admin=1` to the URL. Default admin key: `secret`.

Controls: start question, force reveal, reset game, add/remove bots, navigate question bank, reset questions to defaults.

## Environment Variables

| Variable    | Default  | Description                |
|-------------|----------|----------------------------|
| `PORT`      | `3000`   | Server listening port      |
| `ADMIN_KEY` | `secret` | Admin panel authentication |

## Project Structure

```
quiz-arena/
├── package.json            # Root workspace config
├── server/
│   └── src/
│       ├── index.ts        # Express + Socket.IO, game loop
│       ├── room.ts         # Room state, physics, bot AI
│       └── types.ts        # Shared types & event contracts
└── client/
    ├── index.html          # Entry HTML, join screen, HUD
    ├── vite.config.ts      # Dev server + proxy config
    └── src/
        ├── main.ts         # Join flow, HUD, Phaser init
        ├── network.ts      # Socket.IO client wrapper
        ├── admin.ts        # Admin panel
        ├── questions.json  # Default question bank
        └── scenes/
            └── GameScene.ts  # Phaser scene: rendering, input
```

## License

Private — all rights reserved.
