// ─── Game configuration constants (must match server) ───────────────────────

export const MAP_W = 800;
export const MAP_H = 600;

/** Zone definitions matching server/src/room.ts */
export const ZONES = {
  A: { x: 50,  y: 50,  w: 300, h: 200 },
  B: { x: 450, y: 50,  w: 300, h: 200 },
  C: { x: 50,  y: 350, w: 300, h: 200 },
  D: { x: 450, y: 350, w: 300, h: 200 },
} as const;

/** Zone colors for rendering */
export const ZONE_COLORS: Record<string, number> = {
  A: 0xe94560,  // red
  B: 0x0f3460,  // blue
  C: 0xe9a045,  // orange
  D: 0x16c79a,  // green
};
