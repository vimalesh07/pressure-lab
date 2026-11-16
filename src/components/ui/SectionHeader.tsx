import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">
            <span className="h-px w-6 bg-gradient-to-r from-pink-500 to-transparent" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text-100 md:text-[32px]">
          {title}
        </h1>
        {description && <p className="mt-2 text-[14px] leading-relaxed text-text-400">{description}</p>}
      </div>
      {right}
    </div>
  );
}
