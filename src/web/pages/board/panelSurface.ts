// The classic clue panel's surface (board.css --bt-panel) drawn over a larger area than the panel:
// the host's preview continues the TV's clue panel past the picture (R16-17, R17-17), inside the
// preview page (the panel's bleed) and around it (GameFrame's StageFill), in one coordinate system.

export type Box = { x: number; y: number; w: number; h: number };

/** The classic clue panel's surface for a picture box `p` inside an area of `W` × `H` px: the same
 *  layers, positioned in the picture's coordinates, so they run on past its edges. Keep in step with
 *  board.css --bt-panel. */
export function classicPanelSurface(p: Box, W: number, H: number, grain: number) {
  const r = (rx: number, ry: number, cx: number, cy: number, c: string, stop: number) =>
    `radial-gradient(ellipse ${rx * p.w}px ${ry * p.h}px at ${p.x + cx * p.w}px ${p.y + cy * p.h}px, ${c}, transparent ${stop}%)`;
  // linear-gradient(160deg, …) of the picture, continued over the whole area: the same direction,
  // its stops moved to where they fall on this area's gradient line.
  const a = (160 * Math.PI) / 180;
  const dir = { x: Math.sin(a), y: -Math.cos(a) };
  const lineOf = (w: number, h: number) => Math.abs(w * dir.x) + Math.abs(h * dir.y);
  const Lp = lineOf(p.w, p.h);
  const Lf = lineOf(W, H);
  const shift = (p.x + p.w / 2 - W / 2) * dir.x + (p.y + p.h / 2 - H / 2) * dir.y;
  const at = (frac: number) => `${(Lf / 2 + shift + (frac - 0.5) * Lp).toFixed(1)}px`;
  return [
    `var(--bt-panel-noise) ${p.x}px ${p.y}px / ${grain}px repeat`,
    r(0.38, 0.46, 0.74, 0.34, 'rgba(16, 30, 145, 0.85)', 70),
    r(0.34, 0.4, 0.22, 0.7, 'rgba(14, 27, 140, 0.7)', 70),
    r(0.3, 0.38, 0.38, 0.28, 'rgba(0, 8, 105, 0.75)', 72),
    r(0.36, 0.34, 0.64, 0.86, 'rgba(1, 10, 112, 0.7)', 70),
    `linear-gradient(160deg, #04117f ${at(0)}, #071483 ${at(0.45)}, #061280 ${at(1)}) #071483`, // + the panel colour underneath (background-color)
  ].join(', ');
}

/** How far (px of the preview page) the host's area runs on past the picture on each side. */
export type Bleed = { t: number; r: number; b: number; l: number };
