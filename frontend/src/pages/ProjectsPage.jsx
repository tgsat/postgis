import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function ProjectsPage() {
  const { isSystemAdmin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [maps, setMaps] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [project, setProject] = useState({ company: "", name: "" });
  const [mapForm, setMapForm] = useState({ project: "", name: "", basemap: "osm", is_public: false, datasets: [] });
  const [editingMap, setEditingMap] = useState(null);

  const load = () => {
    api.get("/projects/", { page_size: 500 }).then((d) => setProjects(Array.isArray(d) ? d : (d.results || []))).catch((e) => setErr(e.message));
    api.get("/maps/", { page_size: 500 }).then((d) => setMaps(Array.isArray(d) ? d : (d.results || []))).catch((e) => setErr(e.message));
    api.get("/datasets/", { page_size: 500 }).then((d) => setDatasets(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
  };

  useEffect(load, []);

  const createProject = async (e) => {
    e.preventDefault();
    try {
      await api.post("/projects/", { ...project });
      setProject({ company: "", name: "" });
      setOkMsg("Project created.");
      setErr("");
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const saveMap = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...mapForm,
        datasets: mapForm.datasets.map(Number),
      };
      if (editingMap) await api.put(`/maps/${editingMap}/`, payload);
      else await api.post("/maps/", payload);
      resetMap();
      setOkMsg("Map saved.");
      setErr("");
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const resetMap = () => {
    setEditingMap(null);
    setMapForm({ project: "", name: "", basemap: "osm", is_public: false, datasets: [] });
  };

  const startEditMap = (m) => {
    setEditingMap(m.id);
    setMapForm({
      project: String(m.project),
      name: m.name,
      basemap: m.basemap,
      is_public: !!m.is_public,
      datasets: (m.layers || []).map((l) => String(l.dataset)),
    });
  };

  const delProject = async (id) => {
    if (!window.confirm("Delete project?")) return;
    try {
      await api.del(`/projects/${id}/`);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const delMap = async (id) => {
    if (!window.confirm("Delete map?")) return;
    try {
      await api.del(`/maps/${id}/`);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleDataset = (id) => {
    setMapForm((f) => ({
      ...f,
      datasets: f.datasets.includes(String(id)) ? f.datasets.filter((d) => d !== String(id)) : [...f.datasets, String(id)],
    }));
  };

  const copyShare = async (m) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/public/${m.id}`);
      setOkMsg(`Public link copied: /public/${m.id}`);
    } catch {
      setOkMsg(`Public URL: ${window.location.origin}/public/${m.id}`);
    }
    setErr("");
  };

  const companies = [...new Map(projects.map((p) => [p.company, p.company_name || p.company])).entries()];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Projects &amp; Maps</div>
          <div className="muted">Organize data into projects with dedicated maps</div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      {err && <div className="err">{err}</div>}
      {okMsg && <div className="ok">{okMsg}</div>}
      <div className="grid" style={{ gridTemplateColumns: "var(--form-cols)" }}>
        <div className="card">
          <div className="h1" style={{ fontSize: 16 }}>New Project</div>
          <form onSubmit={createProject}>
            <label>Company</label>
            <select value={project.company} onChange={(e) => setProject({ ...project, company: e.target.value })}>
              <option value="">Select...</option>
              {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label>Name</label>
            <input value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} required />
            <div style={{ marginTop: 14 }}>
              <button className="btn">Create Project</button>
            </div>
          </form>
          <div className="divider" />
          <div className="h1" style={{ fontSize: 16 }}>{editingMap ? "Edit map" : "New Map"}</div>
          <form onSubmit={saveMap}>
            <label>Project</label>
            <select value={mapForm.project} onChange={(e) => setMapForm({ ...mapForm, project: e.target.value })} required>
              <option value="">Select...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.company_name || p.company} / {p.name}</option>)}
            </select>
            <label>Name</label>
            <input value={mapForm.name} onChange={(e) => setMapForm({ ...mapForm, name: e.target.value })} required />
            <label>Basemap</label>
            <select value={mapForm.basemap} onChange={(e) => setMapForm({ ...mapForm, basemap: e.target.value })}>
              <option value="osm">OpenStreetMap</option>
              <option value="carto_light">Carto Light</option>
              <option value="carto_dark">Carto Dark</option>
            </select>
            <label>Datasets on this map</label>
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
              {datasets.length === 0 && <div className="muted">No datasets yet.</div>}
              {datasets.map((d) => (
                <label key={d.id} className="switch">
                  <input type="checkbox" checked={mapForm.datasets.includes(String(d.id))} onChange={() => toggleDataset(d.id)} />
                  <span className="check-label" style={{ cursor: "pointer" }}>{d.name} <span className="muted">({d.geom_type})</span></span>
                </label>
              ))}
            </div>
            <label className="switch" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={mapForm.is_public} onChange={(e) => setMapForm({ ...mapForm, is_public: e.target.checked })} />
              <span className="check-label" style={{ cursor: "pointer" }}>Public map (shareable link, no login)</span>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn">{editingMap ? "Save Map" : "Create Map"}</button>
              {editingMap && <button type="button" className="btn secondary" onClick={resetMap}>Cancel</button>}
            </div>
          </form>
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="h1" style={{ fontSize: 16 }}>Projects</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Name</th><th>Company</th><th>Maps</th><th></th></tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong><div className="muted">{p.code}</div></td>
                      <td>{p.company_name || p.company}</td>
                      <td>{maps.filter((m) => m.project === p.id).length}</td>
                      <td><button className="btn danger small" onClick={() => delProject(p.id)}>Del</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="h1" style={{ fontSize: 16 }}>Maps</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Name</th><th>Project</th><th>Basemap</th><th>Layers</th><th>Public</th><th style={{ minWidth: 200 }}>Actions</th></tr>
                </thead>
                <tbody>
                  {maps.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.project_name || m.project}</td>
                      <td>{m.basemap}</td>
                      <td>{(m.layers || []).length}</td>
                      <td>{m.is_public ? <span className="badge green">Yes</span> : <span className="badge gray">No</span>}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <a className="btn secondary small" href={`/maps?map=${m.id}`}>Open</a>
                          <button className="btn secondary small" onClick={() => startEditMap(m)}>Edit</button>
                          {m.is_public && <button className="btn secondary small" onClick={() => copyShare(m)}>Share</button>}
                          <button className="btn danger small" onClick={() => delMap(m.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}