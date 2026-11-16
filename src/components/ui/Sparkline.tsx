/** Tiny SVG line of match-by-match pressure scores (0–100). Last point is marked. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  min = 0,
  max = 100,
  stroke = "var(--pink-300)",
}: {
  values: number[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  stroke?: string;
}) {
  if (values.length < 2) return null;
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(values.length - 1)},${height} L${x(0)},${height} Z`;
  const last = values[values.length - 1];
  const id = `sg-${values.join("").slice(0, 12)}-${values.length}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Last ${values.length} pressure innings, latest ${last}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} x2={width - pad} y1={y(50)} y2={y(50)} stroke="rgba(60,40,20,0.12)" strokeDasharray="2 3" />
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" className="draw" style={{ ["--len" as string]: 300 }} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={stroke} stroke="var(--bg-800)" strokeWidth={1.5} />
    </svg>
  );
}
