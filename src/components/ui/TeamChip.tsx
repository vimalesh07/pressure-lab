import { cx } from "@/lib/format";
import { kitOf } from "@/lib/teamMeta";

export interface OtherTeam {
  code: string;
  seasons: string;
}

/**
 * Team badge: dot in the team's primary colour (teamMeta) + official code.
 * `secondary` adds a muted second tag (e.g. [RR] IND in the All view); `others` adds a "+n" tooltip
 * listing the other teams in scope ("SRH 2024–25, PBKS 2026").
 */
export function TeamChip({
  code,
  secondary,
  others,
  className,
}: {
  code: string;
  secondary?: string | null;
  others?: OtherTeam[];
  className?: string;
}) {
  const tip = others?.length ? `Also played for: ${others.map((o) => `${o.code} ${o.seasons}`).join(", ")}` : undefined;
  return (
    <span className={cx("inline-flex items-center gap-1", className)}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-ink/[0.04] px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-100 ring-1 ring-ink/10">
        <span className="h-1.5 w-1.5 rounded-full ring-1 ring-ink/15" style={{ background: kitOf(code).shirt }} aria-hidden />
        {code}
      </span>
      {secondary && (
        <span className="whitespace-nowrap text-[10.5px] font-semibold tracking-wide text-text-400/80" title={`Secondary team: ${secondary}`}>
          {secondary}
        </span>
      )}
      {tip && (
        <span
          className="cursor-help whitespace-nowrap rounded-full bg-ink/[0.05] px-1.5 text-[10px] font-semibold text-text-400 ring-1 ring-ink/10"
          title={tip}
          aria-label={tip}
        >
          +{others!.length}
        </span>
      )}
    </span>
  );
}
