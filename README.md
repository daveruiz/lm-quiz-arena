# Quiz Arena

A **web multiplayer** quiz game for presentations. Players join from their phones/laptops, control a character on a top-down map, and must move to the correct answer zone before time runs out. Wrong answer? You're out.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Run in development mode (server + client)
pnpm dev

# 3. Open the game
# Players:  http://localhost:5173
# Admin:    http://localhost:5173?admin=1
```

## How It Works

1. **Join** – Players open the URL and enter a nickname.
2. **Lobby** – Everyone spawns at the center of the map. Move around freely with WASD/arrows (or touch drag on mobile).
3. **Question** – The admin sends a question with 4 options (A/B/C/D). Each zone on the map corresponds to an answer.
4. **Move!** – Players have limited time to run to the zone they think is correct.
5. **Reveal** – When the timer expires (or admin forces reveal), the correct zone lights up. Players in the wrong zone are eliminated (semi-transparent, can't move).
6. **Repeat** – Admin sends the next question. Last players standing win!

### Late Joiners
If a question is already in progress, late joiners become **ghosts** (spectators for the current round). They can still move around but don't count toward scoring.

## Admin Panel

The admin panel is enabled by adding `?admin=1` to the URL. The admin key is set via the `ADMIN_KEY` environment variable (defaults to `"secret"`).

Admin controls:
- **Start Question** – Type a question, fill in A/B/C/D, select the correct answer, set duration, and send.
- **Force Reveal** – Immediately reveal the answer (skips the timer).
- **Reset Game** – Return to lobby; all players revive and respawn at center.

## Environment Variables

| Variable    | Default    | Description                          |
|-------------|------------|--------------------------------------|
| `PORT`      | `3000`     | Server port                          |
| `ADMIN_KEY` | `"secret"` | Key required for admin actions       |

## Production Build

```bash
pnpm build
pnpm start
```

In production, serve the built client (`client/dist/`) as static files from the Express server, or use a reverse proxy (nginx, Caddy, etc.).

## Project Structure

```
quiz-arena/
├── package.json          # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json    # Shared TS config
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Express + Socket.IO server, game loop
│       ├── room.ts       # In-memory room state + quiz state machine
│       └── types.ts      # Shared types & Socket.IO event contracts
└── client/
    ├── package.json
    ├── index.html        # Entry HTML with join screen + HUD
    ├── vite.config.ts    # Vite + proxy to server
    └── src/
        ├── main.ts       # Client entry: join flow, HUD, Phaser init
        ├── config.ts     # Map/zone constants (mirrors server)
        ├── network.ts    # Socket.IO client wrapper
        ├── admin.ts      # Admin panel (enabled via ?admin=1)
        └── scenes/
            └── GameScene.ts  # Phaser scene: map, zones, players, input
```

## Socket.IO Events

### Client → Server
| Event                | Payload                                          | Description           |
|----------------------|--------------------------------------------------|-----------------------|
| `join`               | `nickname: string`                               | Join the game room    |
| `input`              | `{ x: number, y: number }`                       | Movement input vector |
| `adminStartQuestion` | `{ text, A, B, C, D, correctZone, durationSec, adminKey }` | Start a question |
| `adminReveal`        | `{ adminKey }`                                   | Force reveal answer   |
| `adminReset`         | `{ adminKey }`                                   | Reset to lobby        |

### Server → Client
| Event     | Payload                     | Description                        |
|-----------|-----------------------------|------------------------------------|
| `welcome` | `{ id: string }`            | Confirms join, provides player ID  |
| `state`   | `RoomState`                 | Full state sync (every tick, 20Hz) |
| `error`   | `string`                    | Error message                      |

## Architecture Decisions (MVP)

- **Server-authoritative**: The server owns all positions and game state. Clients send input vectors; the server integrates movement at 20Hz.
- **Client interpolation**: Players are rendered using lerp toward server positions for visual smoothness.
- **No collision/physics**: Players pass through each other. Keeps MVP simple.
- **Single room**: All connections share one room instance. Sufficient for a presentation context.

## Phase 2 (Not Implemented)

### Collisions & Pushing
- Add AABB or circle-based collision detection in the server tick.
- Players push each other when overlapping (impulse-based or simple separation).
- Optional: "shoving" mechanic to knock opponents off platforms.

### Shrinking Platforms
- Each round, reduce the zone bounding boxes by a percentage.
- Creates increasing pressure and more eliminations in later rounds.
- Visual: animate the zone rectangles shrinking with a tween.

### Reconnection & Persistence
- Track players by a session token (cookie or localStorage) instead of socket ID.
- On reconnect, restore the player's state (position, alive/dead/ghost).
- Optional: persist room state to Redis or a file for crash recovery.
- Add a "rejoin" flow that skips the nickname screen if the token is valid.

### Additional Ideas
- Score tracking across rounds (points per survival).
- Spectator mode for eliminated players (free camera).
- Custom map/theme selection.
- Sound effects and music.
- Leaderboard overlay at the end of all rounds.
