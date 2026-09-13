import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { setToken } from "../api.js";
import { useTheme } from "../theme.jsx";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/maps", label: "Maps" },
  { to: "/data", label: "Data & Layers" },
  { to: "/content", label: "Content" },
  { to: "/projects", label: "Projects & Maps" },
  { to: "/forms", label: "Forms" },
];

const THEME_LABEL = { light: "Light", dark: "Dark", system: "System" };

export default function Layout() {
  const { user, isSystemAdmin } = useAuth();
  const { theme, cycle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const signOut = () => {
    setToken("");
    navigate("/login");
  };

  return (
    <div className="layout">
      <div className={"sidebar-overlay" + (menuOpen ? " show" : "")} onClick={() => setMenuOpen(false)} />
      <div className="mobile-topbar">
        <button className="btn secondary icon" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
        <span className="brand">GeoDash</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn secondary icon" onClick={cycle} title={`Theme: ${THEME_LABEL[theme]}`} aria-label="Toggle theme">
            {theme === "light" ? "☀" : theme === "dark" ? "◐" : "◐"}
          </button>
        </div>
      </div>

      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          GeoDash
          <span>Self-hosted GIS Platform</span>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
            {n.label}
          </NavLink>
        ))}
        {isSystemAdmin && (
          <>
            <div className="nav-head">System</div>
            <NavLink to="/admin" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              Admin Console
            </NavLink>
            <NavLink to="/admin/audit" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              Audit Logs
            </NavLink>
            <NavLink to="/admin/backup" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              Backup & Restore
            </NavLink>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ margin: "8px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Theme</span>
          <div className="theme-switch">
            <button className={theme === "light" ? "active" : ""} onClick={() => cycle()} title="Toggle light/dark/system">
              {THEME_LABEL[theme]}
            </button>
          </div>
        </div>
        <div className="nav-link" style={{ fontSize: 13 }}>
          <div className="muted">{user?.full_name || user?.username}</div>
          <div className="muted">
            {user?.is_system_admin ? "System Administrator" : user?.role_type}
          </div>
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={signOut}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}