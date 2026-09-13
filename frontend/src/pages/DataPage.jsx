import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function DataPage() {
  const { isSystemAdmin } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ company: "", project: "", name: "", geom_type: "Point", srid: 4326 });
  const [editing, setEditing] = useState(null);
  const [features, setFeatures] = useState([]);
  const [featureDataset, setFeatureDataset] = useState(null);
  const [page, setPage] = useState(1);
  const [ingesting, setIngesting] = useState(null);

  const load = () => {
    api.get("/datasets/", { page_size: 500 }).then((data) => {
      setDatasets(Array.isArray(data) ? data : data.results || []);
    }).catch((e) => setErr(e.message));
    if (isSystemAdmin) api.get("/users/companies/", { page_size: 500 }).then((d) => setCompanies(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
  };

  useEffect(load, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const saveDataset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (editing) {
        await api.patch(`/datasets/${editing}/`, form);
        setEditing(null);
      } else {
        await api.post("/datasets/", form);
      }
      setForm({ company: "", project: "", name: "", geom_type: "Point", srid: 4326 });
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const loadFeatures = async (ds) => {
    setFeatureDataset(ds);
    setPage(1);
    const data = await api.get("/features/", { dataset: ds.id, page: 1 });
    setFeatures(Array.isArray(data) ? data : (data.results || []));
  };

  const prevPage = (p) => async () => {
    setPage(p);
    const data = await api.get("/features/", { dataset: featureDataset.id, page: p });
    setFeatures(Array.isArray(data) ? data : (data.results || []));
  };

  const deleteDataset = async (id) => {
    if (!window.confirm("Delete this dataset and all its features?")) return;
    try {
      await api.del(`/datasets/${id}/`);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const togglePublish = async (ds) => {
    try {
      await api.post(`/datasets/${ds.id}/${ds.is_published ? "unpublish" : "publish"}/`);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const ingest = async (ds, e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIngesting(ds.id);
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.upload(`/datasets/${ds.id}/ingest/`, fd);
      alert(`Ingest queued (task ${res.task_id}). Features will appear once processed by the worker.`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setIngesting(null);
      e.target.value = "";
    }
  };

  const exportFeat = (fmt) => {
    const qs = featureDataset ? `?dataset=${featureDataset.id}` : "";
    const base = `/api/v1/features/exports/${fmt}${qs}`;
    const a = document.createElement("a");
    a.href = base;
    a.setAttribute("download", "");
    a.click();
  };

  const editable = form.company ? { ...form, company: Number(form.company) } : form;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Data &amp; Layers</div>
          <div className="muted">Datasets, features and attachments stored in PostGIS</div>
        </div>
        <button className="btn" onClick={() => load()}>Refresh</button>
      </div>
      {err && <div className="err">{err}</div>}

      <div className="grid" style={{ gridTemplateColumns: "var(--data-cols)" }}>
        <div className="card">
          <div className="h1" style={{ fontSize: 16 }}>{editing ? "Edit dataset" : "Create dataset"}</div>
          <form onSubmit={saveDataset}>
            {isSystemAdmin && (
              <>
                <label>Company</label>
                <select value={form.company} onChange={set("company")} required={!editing}>
                  <option value="">Select company...</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
            <label>Name</label>
            <input value={form.name} onChange={set("name")} required />
            <label>Geometry Type</label>
            <select value={form.geom_type} onChange={set("geom_type")}>
              <option>Point</option>
              <option>LineString</option>
              <option>Polygon</option>
              <option>MultiPoint</option>
              <option>MultiLineString</option>
              <option>MultiPolygon</option>
              <option>Geometry</option>
            </select>
            <label>SRID</label>
            <input type="number" value={form.srid} onChange={set("srid")} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn" disabled={busy}>{editing ? "Save" : "Create"}</button>
              {editing && <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>}
            </div>
          </form>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div className="h1" style={{ fontSize: 16 }}>Datasets</div>
          <div className="table-scroll">
            <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Type</th>
                <th>Features</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong><div className="muted">{d.table_name}</div></td>
                  <td>{d.company_name || d.company}</td>
                  <td>{d.geom_type}</td>
                  <td>{Number(d.feature_count || 0).toLocaleString()}</td>
                  <td>
                    <span className={"badge " + (d.is_published ? "green" : "gray")} style={{ marginRight: 6 }}>
                      {d.is_published ? "Published" : "Draft"}
                    </span>
                    {d.is_public && <span className="badge blue">Public</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button className="btn secondary small" onClick={() => loadFeatures(d)}>Data</button>
                      <button className="btn secondary small" onClick={() => togglePublish(d)}>
                        {d.is_published ? "Unpublish" : "Publish"}
                      </button>
                      <label className="btn secondary small" style={{ cursor: "pointer", position: "relative" }}>
                        {ingesting === d.id ? "..." : "Ingest"}
                        <input type="file" style={{ display: "none" }} onChange={(e) => ingest(d, e)} />
                      </label>
                      <button className="btn secondary small" onClick={() => { setEditing(d.id); setForm({ company: String(d.company || ""), project: d.project || "", name: d.name, geom_type: d.geom_type, srid: d.srid }); }}>Edit</button>
                      <button className="btn danger small" onClick={() => deleteDataset(d.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {featureDataset && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="h1" style={{ fontSize: 16 }}>Features — {featureDataset.name}</div>
              <div className="muted">GeoJSON in/out over the REST API</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn secondary small" onClick={() => exportFeat("geojson")}>Export GeoJSON</button>
              <button className="btn secondary small" onClick={() => exportFeat("csv")}>Export CSV</button>
              <button className="btn secondary small" onClick={() => setFeatureDataset(null)}>Close</button>
            </div>
          </div>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Geometry</th>
                <th>Properties</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.geom || f.geometry ? (f.geom || f.geometry) : "—"}
                  </td>
                  <td>{JSON.stringify(f.props || {}, null, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button className="btn secondary small" onClick={prevPage(page - 1)} disabled={page === 1}>Prev</button>
            <span>Page {page}</span>
            <button className="btn secondary small" onClick={prevPage(page + 1)} disabled={features.length < 25}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}