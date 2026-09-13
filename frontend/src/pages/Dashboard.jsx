import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

function fmtBytes(n) {
  if (n == null) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function Dashboard() {
  const { user, isSystemAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/dashboards/platform/stats/").then(setStats).catch((e) => setErr(e.message));
  }, []);

  const items = stats?.stats ? Object.entries(stats.stats) : [];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Dashboard</div>
          <div className="muted">
            {isSystemAdmin ? "Platform-wide overview" : "Your organization overview"} · Welcome back, {user?.first_name || user?.username}
          </div>
        </div>
        <span className="badge green">System Status: ONLINE</span>
      </div>
      {err && <div className="err">{err}</div>}
      {!stats && !err && <div className="spinner" />}
      {stats && (
        <div className="grid grid-4">
          {items.map(([key, value]) => (
            <div className="stat" key={key}>
              <div className="label">{key.replace(/_/g, " ")}</div>
              <div className="value">{key.includes("bytes") || key.includes("storage") ? fmtBytes(value) : Number(value).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="h1" style={{ fontSize: 16 }}>Welcome to GeoDash</div>
        <p className="muted">
          Self-hosted Web GIS platform powered by Django, PostGIS and MapLibre. No ArcGIS credits required.
        </p>
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <div className="card" style={{ background: "var(--panel-2)" }}>
            <div className="muted" style={{ color: "var(--text)" }}><strong>1.</strong> Open <strong>Maps</strong> to view layers on the interactive map.</div>
          </div>
          <div className="card" style={{ background: "var(--panel-2)" }}>
            <div className="muted" style={{ color: "var(--text)" }}><strong>2.</strong> Manage datasets & features under <strong>Data &amp; Layers</strong>.</div>
          </div>
        </div>
      </div>
    </>
  );
}