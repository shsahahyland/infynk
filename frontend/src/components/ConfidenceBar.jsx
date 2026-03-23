import { useEffect, useState } from "react";

const CONFIDENCE_LEVELS = [
  { threshold: 0.7, color: "#00e5c0", label: "High confidence" },
  { threshold: 0.4, color: "#ffb347", label: "Medium" },
  { threshold: 0, color: "#ff5c7a", label: "Low" },
];
const ANIMATE_DELAY_MS = 60;

const getLevel = (value) =>
  CONFIDENCE_LEVELS.find((l) => value >= l.threshold) ?? CONFIDENCE_LEVELS[2];

export default function ConfidenceBar({ value = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(
      () => setWidth(Math.round(value * 100)),
      ANIMATE_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [value]);

  const { color, label } = getLevel(value);
  const pct = Math.round(value * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
          Confidence
        </span>
        <span className="font-mono text-[10px]" style={{ color }}>
          {label} · {pct}%
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
