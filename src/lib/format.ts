export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-IN");
export const fmt1 = (n: number) => n.toFixed(1);
export const fmt2 = (n: number) => n.toFixed(2);
export const signed = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(d)}`;
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Pressure scale: 0 = calm (blue) → 1 = extreme (red-pink). */
const STOPS: [number, [number, number, number]][] = [
  [0, [74, 115, 168]],
  [0.35, [124, 103, 166]],
  [0.72, [178, 58, 98]],
  [1, [194, 69, 63]],
];
export function pressureColor(t: number, alpha = 1) {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (v <= p1) {
      const k = (v - p0) / (p1 - p0);
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k));
      return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
    }
  }
  return `rgba(194,69,63,${alpha})`;
}

/** Diverging performance colour around 100 = expected. Below → danger-ish pink-red, above → blue/teal. */
export function perfColor(index: number) {
  const d = Math.max(-1, Math.min(1, (index - 100) / 50));
  if (d >= 0) return `rgba(74,115,168,${0.15 + d * 0.75})`;
  return `rgba(178,58,98,${0.15 + -d * 0.75})`;
}

export function ratingTier(r: number) {
  if (r >= 80) return "Best under pressure";
  if (r >= 70) return "Strong under pressure";
  if (r >= 60) return "Reliable";
  if (r >= 45) return "Neutral";
  return "Fragile";
}
