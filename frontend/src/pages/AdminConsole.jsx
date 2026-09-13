import React, { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

function fmtBytes(n) {
  if (n == null) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

function Section({ title, children }) {
  return (
    <div className="card">
      <div className="h1" style={{ fontSize: 17, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/dashboards/platform/stats/").then(setStats).catch(() => {});
  }, []);
  if (!stats) return <div className="spinner" />;
  return (
    <>
      <div className="grid grid-4">
        {Object.entries(stats.stats).map(([k, v]) => (
          <div className="stat" key={k}>
            <div className="label">{k.replace(/_/g, " ")}</div>
            <div className="value">{k.includes("bytes") ? fmtBytes(v) : Number(v).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        System Administrator has full platform-wide access (ALL = TRUE). All management actions are recorded in the audit log.
      </p>
    </>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const [roles] = useState(["Company Admin", "GIS Manager", "Editor", "Surveyor", "Viewer"]);
  const load = () => api.get("/users/", { page_size: 500 }).then((d) => setUsers(Array.isArray(d) ? d : (d.results || [])));
  useEffect(load, []);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ username: "", email: "", first_name: "", last_name: "", password: "", role_type: "viewer" });

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users/", form);
      setForm({ username: "", email: "", first_name: "", last_name: "", password: "", role_type: "viewer" });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const toggle = async (u) => {
    try {
      await api.patch(`/users/${u.id}/`, { is_active: !u.is_active });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const del = async (u) => {
    if (!window.confirm(`Delete user ${u.username}?`)) return;
    try {
      await api.del(`/users/${u.id}/`);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <Section title="User Management">
      {err && <div className="err">{err}</div>}
      <div className="grid grid-2">
        <form onSubmit={create} className="card" style={{ background: "var(--panel-2)" }}>
          <div className="muted" style={{ color: "var(--text)", fontWeight: 700, marginBottom: 4 }}>Create user</div>
          <div className="grid grid-2">
            <div><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
            <div><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label>First name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><label>Last name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            <div><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
            <div><label>Default role</label>
              <select value={form.role_type} onChange={(e) => setForm({ ...form, role_type: e.target.value })}>
                {roles.map((r) => <option key={r}>{r}</option>)}
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn">Create</button></div>
        </form>
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong><div className="muted">{u.email}</div></td>
                <td>{u.role_type}{u.is_system_admin ? <span className="pill">SYSADMIN</span> : null}</td>
                <td>{u.is_active ? <span className="badge green">Active</span> : <span className="badge red">Inactive</span>}</td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn secondary small" onClick={() => toggle(u)}>Toggle</button>
                    {!u.is_system_admin && <button className="btn danger small" onClick={() => del(u)}>Del</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", org_id: "", code: "", description: "" });
  const load = () => api.get("/users/companies/", { page_size: 500 }).then((d) => setCompanies(Array.isArray(d) ? d : (d.results || [])));
  const refreshPreview = () => {
    api.get("/users/companies/org-id-preview/").then((r) => setForm((f) => ({ ...f, org_id: r.org_id }))).catch(() => {});
  };
  useEffect(load, []);
  useEffect(refreshPreview, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, org_id: form.org_id || undefined, code: form.code || undefined };
      const res = await api.post("/users/companies/", payload);
      setForm({ name: "", org_id: "", code: "", description: "" });
      refreshPreview();
      load();
      alert(`Organization "${res.name}" created.\nOrg ID: ${res.org_id}`);
    } catch (e2) {
      setErr(e2.message);
      refreshPreview();
    }
  };

  const del = async (c) => {
    if (!window.confirm(`Delete company ${c.name} and everything inside?`)) return;
    try {
      await api.del(`/users/companies/${c.id}/`);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <Section title="Organization Management">
      {err && <div className="err">{err}</div>}
      <div className="grid grid-2">
        <form onSubmit={create} className="card" style={{ background: "var(--panel-2)" }}>
          <div className="muted" style={{ color: "var(--text)", fontWeight: 700, marginBottom: 4 }}>Create company</div>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Org ID (generated by system)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={form.org_id}
              readOnly
              style={{ fontFamily: "monospace", background: "var(--panel-1)", color: "var(--text)" }}
            />
            <button type="button" className="btn secondary small" onClick={refreshPreview} title="Generate new ID">⟳</button>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Auto-generated, unique 10-character ID (digits & letters, upper/lower case).</div>
          <label>Code (optional)</label>
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div style={{ marginTop: 12 }}><button className="btn">Create</button></div>
        </form>
        <table>
          <thead><tr><th>Name</th><th>Org ID</th><th>Code</th><th>Members</th><th style={{ textAlign: "right" }}></th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><code>{c.org_id}</code></td>
                <td>{c.code || "–"}</td>
                <td>{c.member_count ?? 0}</td>
                <td><button className="btn danger small" style={{ float: "right" }} onClick={() => del(c)}>Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Roles() {
  const [roles, setRoles] = useState([]);
  const load = () => api.get("/rbac/roles/", { page_size: 500 }).then((d) => setRoles(Array.isArray(d) ? d : (d.results || [])));
  useEffect(load, []);
  return (
    <Section title="Role & Permission Management">
      <table>
        <thead><tr><th>Role</th><th>Description</th><th>System</th><th>ALL</th><th>Default</th><th>Permissions</th></tr></thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong></td>
              <td className="muted">{r.description}</td>
              <td>{r.is_system ? <span className="badge blue">Yes</span> : <span className="badge gray">No</span>}</td>
              <td>{r.is_all ? <span className="badge green">ALL</span> : <span className="badge gray">No</span>}</td>
              <td>{r.is_company_default ? <span className="badge orange">Default</span> : <span className="badge gray">No</span>}</td>
              <td>
                {(r.permissions || []).length > 0
                  ? <span className="muted">{r.permissions.length} permissions</span>
                  : <span className="muted">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function Audit() {
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/rbac/audit-logs/", { page_size: 200 }).then((d) => setLogs(Array.isArray(d) ? d : (d.results || []))).catch((e) => setErr(e.message));
  }, []);
  return (
    <Section title="Audit Logs">
      {err && <div className="err">{err}</div>}
      <table>
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Detail</th><th>IP</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted">{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.username || "system"}</td>
              <td><span className="badge orange">{l.action}</span></td>
              <td>{l.resource_type}{l.resource_id ? ` #${l.resource_id}` : ""}</td>
              <td className="muted">{l.detail}</td>
              <td className="muted">{l.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function Settings() {
  const [settings, setSettings] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ key: "", value: "", value_type: "str", description: "" });
  const load = () => api.get("/system/settings/", { page_size: 500 }).then((d) => setSettings(Array.isArray(d) ? d : (d.results || [])));
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/system/settings/", form);
      setForm({ key: "", value: "", value_type: "str", description: "" });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <Section title="System Settings">
      {err && <div className="err">{err}</div>}
      <div className="grid grid-2">
        <form onSubmit={create} className="card" style={{ background: "var(--panel-2)" }}>
          <label>Key</label><input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required />
          <label>Value</label><input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <label>Type</label>
          <select value={form.value_type} onChange={(e) => setForm({ ...form, value_type: e.target.value })}>
            {["str", "int", "bool", "hash", "json"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div style={{ marginTop: 12 }}><button className="btn">Save</button></div>
        </form>
        <table>
          <thead><tr><th>Key</th><th>Value</th><th>Type</th></tr></thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.id}><td><strong>{s.key}</strong></td><td className="muted">{String(s.value).substring(0, 60)}</td><td>{s.value_type}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Backup() {
  const [jobs, setJobs] = useState([]);
  const [dbs, setDbs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => {
    api.get("/system/backups/", { page_size: 100 }).then((d) => setJobs(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
    api.get("/system/database/", {}).then(setDbs).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.post("/system/backups/create_backup/", {});
      alert("Backup created.");
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (!window.confirm("Restore will overwrite the current database. Continue?")) return;
    try {
      const res = await api.upload("/system/backups/restore/", fd);
      alert(`Restore ${res.status}: ${res.error || "done"}`);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <Section title="Backup & Restore">
      {err && <div className="err">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" disabled={busy} onClick={createBackup}>{busy ? "Running..." : "Create Backup"}</button>
        <label className="btn secondary" style={{ cursor: "pointer", position: "relative" }}>
          Restore from file
          <input type="file" style={{ display: "none" }} onChange={restore} />
        </label>
      </div>
      {dbs && (
        <table style={{ marginBottom: 16 }}>
          <thead><tr><th>Database</th><th>Size</th><th>PostGIS</th></tr></thead>
          <tbody>
            {dbs.databases.map((d) => (
              <tr key={d.name}><td><strong>{d.name}</strong></td><td>{d.size}</td><td>{dbs.postgis_version}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <table>
        <thead><tr><th>Name</th><th>Size</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.name}</td>
              <td>{fmtBytes(j.size_bytes)}</td>
              <td><span className={"badge " + (j.status === "success" ? "green" : j.status === "failed" ? "red" : "orange")}>{j.status}</span>{j.error ? <div className="err">{j.error}</div> : null}</td>
              <td className="muted">{new Date(j.started_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function StorageView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/system/storage/", {}).then(setData).catch((e) => setErr(e.message));
  }, []);
  return (
    <Section title="Storage Management">
      {err && <div className="err">{err}</div>}
      {data && (
        <>
          <div className="muted" style={{ marginBottom: 10 }}>Root: {data.root}</div>
          <table>
            <thead><tr><th>Path</th><th>Size</th><th>Kind</th></tr></thead>
            <tbody>
              {data.files.map((f, i) => (
                <tr key={i}><td>{f.path}</td><td>{fmtBytes(f.size)}</td><td>{f.kind}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

function DatabaseV() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/system/database/", {}).then(setData).catch((e) => setErr(e.message));
  }, []);
  return (
    <Section title="Database Management">
      {err && <div className="err">{err}</div>}
      {data && (
        <table>
          <thead><tr><th>Schema</th><th>Table</th></tr></thead>
          <tbody>
            {data.tables.map((t, i) => (
              <tr key={i}><td><span className="pill">{t.schema}</span></td><td>{t.table}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function AdminConsole() {
  const { isSystemAdmin } = useAuth();
  if (!isSystemAdmin) return <Navigate to="/" replace />;

  const tabs = [
    { to: "/admin", label: "Overview", end: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/companies", label: "Companies" },
    { to: "/admin/roles", label: "Roles" },
    { to: "/admin/audit", label: "Audit Logs" },
    { to: "/admin/settings", label: "Settings" },
    { to: "/admin/storage", label: "Storage" },
    { to: "/admin/database", label: "Database" },
    { to: "/admin/backup", label: "Backup" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Admin Console</div>
          <div className="muted">Full platform administration — System Administrator only</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 18 }}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => "btn secondary small" + (isActive ? " accent" : "")}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="users" element={<Users />} />
        <Route path="companies" element={<Companies />} />
        <Route path="roles" element={<Roles />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="storage" element={<StorageView />} />
        <Route path="database" element={<DatabaseV />} />
        <Route path="backup" element={<Backup />} />
      </Routes>
    </>
  );
}

export default AdminConsole;