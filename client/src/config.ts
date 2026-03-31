// ─── Game configuration constants (must match server) ───────────────────────

export const MAP_W = 800;
export const MAP_H = 600;

/** Fixed centre of each quadrant – zones grow/shrink around these points */
export const ZONE_CENTERS: Record<string, { x: number; y: number }> = {
  A: { x: 200, y: 150 },
  B: { x: 600, y: 150 },
  C: { x: 200, y: 450 },
  D: { x: 600, y: 450 },
};

export const MIN_ZONE_SIZE = 100;
export const MAX_ZONE_SIZE = 270;

/** Zone colors for rendering */
export const ZONE_COLORS: Record<string, number> = {
  A: 0xe94560,  // red
  B: 0x0f3460,  // blue
  C: 0xe9a045,  // orange
  D: 0x16c79a,  // green
};
