import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/** Generic page skeleton: header + KPI row + two panels. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading data" className="space-y-6">
      <Skeleton className="h-10 w-80 max-w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Skeleton className="col-span-12 h-80 lg:col-span-8" />
        <Skeleton className="col-span-12 h-80 lg:col-span-4" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  icon,
  tone = "neutral",
  action,
}: {
  title: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "neutral" | "error";
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span
        className={cx(
          "grid h-12 w-12 place-items-center rounded-2xl ring-1",
          tone === "error" ? "bg-danger/10 text-danger ring-danger/25" : "bg-ink/5 text-text-400 ring-ink/10",
        )}
      >
        {icon ?? (tone === "error" ? <AlertTriangle size={22} /> : <Inbox size={22} />)}
      </span>
      <div className="font-display text-[16px] font-semibold">{title}</div>
      {detail && <p className="max-w-md text-[13px] text-text-400">{detail}</p>}
      {action}
    </div>
  );
}

/** Wraps a useData() result: skeleton while loading, error card on failure. */
export function DataGate<T>({
  state,
  children,
  skeleton,
}: {
  state: { data: T | undefined; error: Error | undefined; loading: boolean };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  if (state.loading) return <>{skeleton ?? <PageSkeleton />}</>;
  if (state.error || state.data === undefined)
    return (
      <EmptyState
        tone="error"
        title="Data file could not be loaded"
        detail={`${state.error?.message ?? "Unknown error"}. Check that the file exists in /public/data and matches the schema in README.md.`}
      />
    );
  return <>{children(state.data)}</>;
}
