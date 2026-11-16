import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/format";

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: "pink" | "blue";
  index?: number; // stagger order for the rise animation
  as?: "div" | "section" | "article";
  style?: CSSProperties;
}

export function Card({ children, className, glow, index = 0, as: Tag = "div", style }: CardProps) {
  return (
    <Tag
      className={cx("glass rise relative", glow === "pink" && "glow-pink", glow === "blue" && "glow-blue", className)}
      style={{ ["--i" as string]: index, ...style }}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink/5 text-pink-300 ring-1 ring-ink/10">
            {icon}
          </span>
        )}
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-text-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-text-400">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
