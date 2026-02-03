import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { getAuditTopActions } from "../../services/adminMetrics.service";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function AuditTopActionsBarChart() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAuditTopActions(7, 8);
      setRows(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to load audit action metrics."
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const chartData = useMemo(() => {
    const labels = rows.map((r) => r.action || "unknown");
    const counts = rows.map((r) => r.count || 0);
    return {
      labels,
      datasets: [
        {
          label: "Top actions (7 days)",
          data: counts,
          backgroundColor: "rgba(234, 179, 8, 0.55)",
          borderColor: "rgba(234, 179, 8, 0.9)",
          borderWidth: 1,
        },
      ],
    };
  }, [rows]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#e2e8f0" },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} events`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8" },
        grid: { color: "rgba(148, 163, 184, 0.15)" },
      },
      y: {
        ticks: { color: "#94a3b8", precision: 0 },
        grid: { color: "rgba(148, 163, 184, 0.15)" },
      },
    },
  };

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <div>
          <h3 className="admin-chart-title">Top Audit Actions (7 days)</h3>
          <p className="admin-chart-subtitle">Most common actions in the last week.</p>
        </div>
      </div>

      {error && <div className="admin-chart-error">{error}</div>}

      {loading ? (
        <div className="admin-chart-loading">Loading chart...</div>
      ) : rows.length === 0 ? (
        <div className="admin-chart-empty">No audit actions yet.</div>
      ) : (
        <div className="admin-chart-canvas">
          <Bar data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
