/**
 * One table for team codes and kit colours, used everywhere in the UI (table badges, shirt rail, jerseys,
 * match centre). Codes come from the pipeline (utils.TEAM_CODES, keyed by team_id); this file only adds colours.
 *   shirt = primary, trim = collar / sleeve cuffs, text = name + number on the shirt.
 */
export interface TeamKit {
  shirt: string;
  trim: string;
  text: string;
}

const RAW: Record<string, TeamKit> = {
  CSK: { shirt: "#F9CD05", trim: "#1C4E9D", text: "#1C4E9D" },
  MI: { shirt: "#004BA0", trim: "#D1AB3E", text: "#FFFFFF" },
  RCB: { shirt: "#D11D25", trim: "#1A1A1A", text: "#FFFFFF" },
  KKR: { shirt: "#3A225D", trim: "#D4AF37", text: "#F2D27A" },
  SRH: { shirt: "#F26522", trim: "#1A1A1A", text: "#1A1A1A" },
  RR: { shirt: "#E91E8C", trim: "#254AA5", text: "#FFFFFF" },
  DC: { shirt: "#17479E", trim: "#D71920", text: "#FFFFFF" },
  PBKS: { shirt: "#DD1F2D", trim: "#C0C0C0", text: "#FFFFFF" },
  GT: { shirt: "#1B2133", trim: "#C9A74E", text: "#C9A74E" },
  LSG: { shirt: "#0B4DA2", trim: "#E85B24", text: "#FFFFFF" },
  IND: { shirt: "#1F5AA6", trim: "#FF8C1A", text: "#FFFFFF" },
  AUS: { shirt: "#FFCD00", trim: "#00843D", text: "#00843D" },
  ENG: { shirt: "#1C2C5B", trim: "#D21034", text: "#FFFFFF" },
  SA: { shirt: "#007A4D", trim: "#FFB612", text: "#FFB612" },
  NZ: { shirt: "#111111", trim: "#8A8A8A", text: "#FFFFFF" },
  WI: { shirt: "#7B1E3A", trim: "#F2B300", text: "#FFFFFF" },
  PAK: { shirt: "#01411C", trim: "#FFFFFF", text: "#FFFFFF" },
  SL: { shirt: "#1A3D8F", trim: "#F7B500", text: "#F7B500" },
  AFG: { shirt: "#1A56DB", trim: "#D32011", text: "#FFFFFF" },
  BAN: { shirt: "#006A4E", trim: "#F42A41", text: "#FFFFFF" },
};
export const DEFAULT_KIT: TeamKit = { shirt: "#6B6B6B", trim: "#3A3A3A", text: "#FFFFFF" };

export const IPL_CODES = new Set(["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"]);

function lum(hex: string) {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Kit for a team code ("IND-A" uses IND's colours). Text colour is swapped to white / black if it fails 4.5:1. */
export function kitOf(code: string | undefined | null): TeamKit {
  const base = (code ?? "").split("-")[0].toUpperCase();
  const k = RAW[base] ?? DEFAULT_KIT;
  if (contrast(k.shirt, k.text) >= 4.5) return k;
  const white = contrast(k.shirt, "#FFFFFF");
  const black = contrast(k.shirt, "#1A1A1A");
  return { ...k, text: white >= black ? "#FFFFFF" : "#1A1A1A" };
}

export const isKnownTeam = (code: string | undefined | null) => !!code && (code.split("-")[0].toUpperCase() in RAW);
