"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Hexagon } from "lucide-react";
import type { RadarFeature } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { LegendItem } from "@/components/ui/Controls";
import { TooltipBox, TooltipRow } from "./ChartTooltip";
import { useReducedMotion } from "./useReducedMotion";

export function RadarCard({
  features,
  name,
  index,
  className,
}: {
  features: RadarFeature[];
  name: string;
  index?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <Card index={index} className={`p-5 ${className ?? ""}`}>
      <CardHeader
        icon={<Hexagon size={16} />}
        title="Feature scores"
        subtitle="Percentile vs role peers, pressure balls only"
      />
      <div className="h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={features} outerRadius="70%" margin={{ top: 4, right: 40, bottom: 4, left: 40 }}>
            <defs>
              <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4A73A8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#B23A62" stopOpacity={0.45} />
              </radialGradient>
            </defs>
            <PolarGrid stroke="rgba(60,40,20,0.09)" />
            <PolarAngleAxis dataKey="feature" tick={{ fontSize: 11, fill: "#2B2118" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
            <Radar
              name="Peer average"
              dataKey="peerAvg"
              stroke="#7A6A58"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              fill="none"
              isAnimationActive={!reduce}
            />
            <Radar
              name={name}
              dataKey="score"
              stroke="#C9688A"
              strokeWidth={2}
              fill="url(#radarFill)"
              dot={{ r: 3, fill: "#C9688A", stroke: "#FFFBF4", strokeWidth: 1.5 }}
              isAnimationActive={!reduce}
              animationDuration={900}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={(payload[0].payload as RadarFeature).feature}>
                    <TooltipRow label={name} value={(payload[0].payload as RadarFeature).score} color="#C9688A" />
                    <TooltipRow label="Peer avg" value={(payload[0].payload as RadarFeature).peerAvg} color="#7A6A58" />
                  </TooltipBox>
                ) : null
              }
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-center gap-5">
        <LegendItem color="var(--pink-300)" label={name} />
        <LegendItem color="var(--text-400)" label="Peer average (dashed)" shape="line" />
      </div>
    </Card>
  );
}
