import { cx } from "@/lib/format";

/** Text-only team badge. The dot tint is derived from the code: stable, decorative, never meaningful on its own. */
const TINTS = ["#4A73A8", "#C9688A", "#7C67A6", "#2F8F6A", "#B8862B", "#5B9BB8"];
function tintFor(code: string) {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function TeamChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-ink/[0.04] px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-100 ring-1 ring-ink/10",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tintFor(code) }} aria-hidden />
      {code}
    </span>
  );
}
