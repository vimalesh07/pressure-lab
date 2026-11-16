import { cx, signed } from "@/lib/format";

/** ▲/▼ change pill. `good` sets the colour; the arrow always follows the sign, so meaning never relies on colour alone. */
export function DeltaPill({
  value,
  suffix = "%",
  good,
  size = "md",
  digits = 1,
}: {
  value: number;
  suffix?: string;
  good?: boolean; // defaults to value >= 0
  size?: "sm" | "md";
  digits?: number;
}) {
  const isGood = good ?? value >= 0;
  const flat = Math.abs(value) < 0.05;
  return (
    <span
      className={cx(
        "tnum inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[12px]",
        flat
          ? "bg-ink/5 text-text-400 ring-ink/10"
          : isGood
            ? "bg-success/10 text-success ring-success/25"
            : "bg-danger/10 text-danger ring-danger/25",
      )}
      title={isGood ? "Better under pressure" : "Worse under pressure"}
    >
      <span aria-hidden>{flat ? "•" : value > 0 ? "▲" : "▼"}</span>
      {signed(value, digits)}
      {suffix}
      <span className="sr-only">{flat ? "no change" : isGood ? "(better)" : "(worse)"}</span>
    </span>
  );
}
