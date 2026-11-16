/**
 * Bootstrap interval as a horizontal band with a dot at the point estimate.
 * Domain defaults to 0–100 (Pressure Rating scale).
 */
export function ConfidenceBand({
  low,
  high,
  value,
  min = 0,
  max = 100,
  width = 150,
  showScale = false,
}: {
  low: number;
  high: number;
  value: number;
  min?: number;
  max?: number;
  width?: number | string;
  showScale?: boolean;
}) {
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div
      className="relative"
      style={{ width }}
      role="img"
      aria-label={`Rating ${value.toFixed(1)}, 90% interval ${low.toFixed(1)} to ${high.toFixed(1)}`}
      title={`${low.toFixed(1)} – ${high.toFixed(1)} (bootstrap 90% interval)`}
    >
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink/[0.07]" />
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute top-0 h-3 w-px bg-ink/10" style={{ left: `${pos(t)}%` }} />
        ))}
        <div
          className="grow-x absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full"
          style={{
            left: `${pos(low)}%`,
            width: `${pos(high) - pos(low)}%`,
            background: "linear-gradient(90deg, rgba(74,115,168,0.55), rgba(178,58,98,0.65))",
          }}
        />
        <div
          className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-100 ring-2 ring-bg-800"
          style={{ left: `${pos(value)}%` }}
        />
      </div>
      {showScale && (
        <div className="tnum mt-1 flex justify-between text-[10px] text-text-400">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}
