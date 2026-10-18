// frontend/src/pages/SyllabusCharts.jsx
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { progressColor } from "./ProgressWidgets";

// ── Batch-wise bar chart (Admin dashboard ke liye) ──────────────
// batches = data.batches  (/syllabus/progress/overview ka response)
export function BatchBarChart({ batches, height }) {
  const data = batches.map((b) => ({
    name: b.batch_name,
    percent: Math.round(b.percent),
    covered: b.covered,
    total: b.total,
  }));
  const h = height || Math.max(160, data.length * 44);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 35 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8eaed" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(v, n, p) => [`${v}% (${p.payload.covered}/${p.payload.total} topics)`, "Progress"]}
        />
        <Bar
          dataKey="percent"
          radius={[0, 6, 6, 0]}
          label={{ position: "right", fontSize: 11, formatter: (v) => `${v}%` }}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={progressColor(d.percent)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Status pie chart (optional, AdminSyllabus ke liye) ──────────
// counts = { done, going, notStarted, none }
export function StatusPie({ counts, height = 240 }) {
  const data = [
    { name: "Completed", value: counts.done, color: "#16a34a" },
    { name: "In progress", value: counts.going, color: "#2563eb" },
    { name: "Not started", value: counts.notStarted, color: "#d97706" },
    { name: "No topics", value: counts.none, color: "#cbd5e1" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Coverage timeline (optional, TeacherSyllabus ke liye) ───────
// topics = detail.topics
export function CoverageTimeline({ topics, height = 220 }) {
  const byDate = {};
  topics.forEach((t) => {
    if (t.covered && t.covered_on) byDate[t.covered_on] = (byDate[t.covered_on] || 0) + 1;
  });
  let running = 0;
  const data = Object.keys(byDate).sort().map((d) => {
    running += byDate[d];
    return { date: d, covered: running };
  });

  if (data.length < 2) {
    return <p style={{ fontSize: 13, color: "#64748b" }}>Tick topics on different days to see the trend.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey="covered" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}