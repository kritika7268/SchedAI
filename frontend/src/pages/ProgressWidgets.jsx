// Small reusable progress widgets (pure CSS / SVG — no chart library needed).

// colour by how far along the syllabus is
export function progressColor(percent) {
  if (percent >= 75) return "#16a34a"; // green
  if (percent >= 40) return "#2563eb"; // blue
  if (percent > 0) return "#d97706"; // amber
  return "#94a3b8"; // grey (nothing covered yet)
}

// horizontal bar: <ProgressBar percent={64.3} />
export function ProgressBar({ percent = 0, color, height = 10 }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div
      style={{
        width: "100%",
        height,
        background: "#e2e8f0",
        borderRadius: height,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${p}%`,
          height: "100%",
          background: color || progressColor(p),
          borderRadius: height,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// donut / ring: <ProgressRing percent={64.3} size={120} />
export function ProgressRing({ percent = 0, size = 120, stroke = 12, color, sub }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - p / 100);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color || progressColor(p)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: size * 0.22, fontWeight: 700, color: "#0f172a" }}>
          {Math.round(p)}%
        </div>
        {sub && <div style={{ fontSize: size * 0.1, color: "#64748b" }}>{sub}</div>}
      </div>
    </div>
  );
}