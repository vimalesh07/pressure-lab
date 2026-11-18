import { kitOf } from "./teamMeta";

/** Primary (shirt) colour of a team; see teamMeta.ts for the full kit. */
export function kitFor(code: string) {
  return kitOf(code).shirt;
}

/** A team colour dark enough to draw a line with on cream (light kits are darkened). */
export function lineColorFor(code: string) {
  const hex = kitFor(code).replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.62) return `#${hex}`;
  const k = 0.62 / lum;
  return `rgb(${Math.round(r * k * 0.8)},${Math.round(g * k * 0.8)},${Math.round(b * k * 0.8)})`;
}
