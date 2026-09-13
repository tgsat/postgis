import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "feature_layer", label: "Feature Layer" },
  { key: "web_map", label: "Web Map" },
];

const TYPE_LABEL = { feature_layer: "Feature Layer", web_map: "Web Map" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ContentPage() {
  const navigate = useNavigate();
  const { isSystemAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("pick"); // pick | processing | ready | error
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [titles, setTitles] = useState({});
  const [lons, setLons] = useState({});
  const [lats, setLats] = useState({});
  const [project, setProject] = useState("");
  const [company, setCompany] = useState("");
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const load = () => {
    api.get("/items/", { page_size: 500 }).then((d) => {
      setItems(Array.isArray(d) ? d : d.results || []);
    }).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  useEffect(() => {
    if (isSystemAdmin) {
      api.get("/users/companies/", { page_size: 500 }).then((d) => setCompanies(Array.isArray(d) ? d : d.results || [])).catch(() => {});
    }
    api.get("/projects/", { page_size: 500 }).then((d) => setProjects(Array.isArray(d) ? d : d.results || [])).catch(() => {});
  }, [isSystemAdmin]);

  const visible = items.filter((i) => {
    if (filter !== "all" && i.item_type !== filter) return false;
    if (query && !(i.title || "").toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const reset = () => {
    setOpen(false);
    setPhase("pick");
    setJob(null);
    setMessage("");
    setProject("");
    setCompany("");
    setErr("");
    setAdvanced(false);
    setTitles({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const pick = (file) => {
    if (!file) return;
    setErr("");
    setJob(null);
    setPhase("processing");
    setMessage("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    if (company) fd.append("company", company);
    api.upload("/upload-jobs/", fd)
      .then((j) => {
        setJob(j);
        setMessage("Analisis layer…");
        return pollJob(j.id);
      })
      .then((done) => {
        setJob(done);
        if (done.status === "failed") {
          setPhase("error");
          setMessage(done.error || "Analisis gagal.");
          return;
        }
        const t = {};
        done.layers.forEach((l) => { t[l.name] = l.title; });
        setTitles(t);
        setPhase("ready");
      })
      .catch((e) => {
        setPhase("error");
        setMessage(e.message || "Upload gagal.");
      });
  };

  const pollJob = (id) => {
    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        try {
          const j = await api.get(`/upload-jobs/${id}/`);
          if (["ready", "success", "failed"].includes(j.status)) {
            clearInterval(timer);
            resolve(j);
          }
        } catch (e) {
          clearInterval(timer);
          resolve({ status: "failed", error: e.message });
        }
      }, 2000);
    });
  };

  const publish = async () => {
    setMessage("Publishing…");
    setPhase("processing");
    const layers = (job.layers || []).map((l) => ({
      name: l.name,
      title: titles[l.name] || l.title,
      lon_col: lons[l.name] || l.lon_col,
      lat_col: lats[l.name] || l.lat_col,
    }));
    try {
      await api.post(`/upload-jobs/${job.id}/publish/`, {
        layers,
        project: project || null,
        field_mapping: {},
      });
      const done = await pollJob(job.id);
      setJob(done);
      if (done.status === "success") {
        const first = done.item_ids && done.item_ids[0];
        reset();
        if (first) navigate(`/items/${first}`);
      } else {
        setPhase("error");
        setMessage(done.error || "Publish gagal.");
      }
    } catch (e) {
      setPhase("error");
      setMessage(e.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Content</div>
          <div className="muted">Item hosted — Feature Layer &amp; Web Map</div>
        </div>
        <button className="btn" onClick={() => { setOpen(true); setPhase("pick"); }}>+ New Item (Add Data)</button>
      </div>
      {err && <div className="err">{err}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={"btn secondary small" + (filter === f.key ? " active" : "")}
            style={filter === f.key ? { background: "var(--accent-2)", color: "#fff" } : {}}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input placeholder="Search title..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 240 }} />
      </div>

      <div className="card">
        {visible.length === 0 && <div className="muted" style={{ padding: 12 }}>Belum ada item. Klik "+ New Item" untuk upload data spasial.</div>}
        {visible.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Sharing</th>
                  <th>Detail</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/items/${i.id}`)}>
                    <td>
                      <strong>{i.title}</strong>
                      <div className="muted">{i.display_title || i.title}</div>
                      <div style={{ marginTop: 4 }}>
                        {i.hosted && <span className="badge blue" style={{ marginRight: 4 }}>hosted</span>}
                        {(i.tags || []).slice(0, 3).map((t) => <span key={t} className="pill">{t}</span>)}
                      </div>
                    </td>
                    <td><span className="badge gray">{TYPE_LABEL[i.item_type] || i.item_type}</span></td>
                    <td>
                      <span className={"badge " + (i.sharing_level === "public" ? "green" : i.sharing_level === "organization" ? "blue" : "gray")}>
                        {i.sharing_level === "organization" ? "Org" : i.sharing_level}
                      </span>
                    </td>
                    <td className="muted">
                      {i.item_type === "feature_layer"
                        ? `${i.geom_type || "Layer"} · ${Number(i.feature_count || 0).toLocaleString()} fitur`
                        : i.map_basemap ? `Basemap ${i.map_basemap}` : "Web Map"}
                    </td>
                    <td className="muted">{i.owner_name || i.company_name}</td>
                    <td className="muted">{new Date(i.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget && phase !== "processing") reset(); }}>
          <div className="modal-box" style={{ width: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="h1" style={{ fontSize: 18 }}>New Item</div>
              <button className="btn secondary icon" onClick={() => phase === "processing" ? null : reset()} disabled={phase === "processing"}>✕</button>
            </div>
            <div className="divider" style={{ margin: "10px 0" }} />

            {phase === "pick" && (
              <>
                <div
                  className="dropzone"
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] || null); }}
                  onClick={() => fileRef.current && fileRef.current.click()}
                >
                  {drag ? <strong>Lepaskan file di sini</strong> : (
                    <>
                      <div style={{ fontSize: 30 }}>⇧</div>
                      <div><strong>Drag &amp; drop</strong> file di sini atau <strong>Browse</strong></div>
                      <div className="muted" style={{ marginTop: 6 }}>.zip (SHP/FileGDB) · .gpkg · .csv · .xlsx — maks 200 MB</div>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept=".zip,.gpkg,.csv,.xlsx" style={{ display: "none" }}
                    onChange={(e) => { pick(e.target.files[0] || null); e.target.value = ""; }} />
                </div>
                {isSystemAdmin && (
                  <>
                    <label>Company</label>
                    <select value={company} onChange={(e) => setCompany(e.target.value)}>
                      <option value="">Pilih company...</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </>
                )}
              </>
            )}

            {phase === "processing" && (
              <div style={{ textAlign: "center", padding: 26 }}>
                <div className="spinner" />
                <div className="muted">{message}</div>
              </div>
            )}

            {phase === "ready" && job && (
              <>
                <div className="ok" style={{ marginBottom: 8 }}>File teranalisis — siap dipublish ✓</div>
                <div className="card" style={{ boxShadow: "none", padding: 12 }}>
                  {job.layers.map((l) => (
                    <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
                      <strong style={{ flex: 1 }}>{l.title}</strong>
                      <span className="badge blue">{l.geom_type}</span>
                      <span className="muted">EPSG:{l.crs || "?"}</span>
                      <span className="muted">{Number(l.feature_count || 0).toLocaleString()} fitur</span>
                      <span className="muted">{l.fields.map((f) => f.name).join(", ")}</span>
                    </div>
                  ))}
                </div>

                <details style={{ margin: "12px 0" }} open={advanced} onToggle={(e) => setAdvanced(e.target.open)}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>Advanced options…</summary>
                  <div style={{ marginTop: 10 }}>
                    {job.layers.map((l) => (
                      <div key={l.name} style={{ marginBottom: 10 }}>
                        <label>Judul «{l.name}»</label>
                        <input value={titles[l.name] || ""} onChange={(e) => setTitles({ ...titles, [l.name]: e.target.value })} />
                        {(l.geom_type === "Point" || l.table_kind === "tabular") && (
                          <div className="grid grid-2">
                            <div>
                              <label>Kolom Longitude / X</label>
                              <select value={lons[l.name] || l.lon_col || ""} onChange={(e) => setLons({ ...lons, [l.name]: e.target.value })}>
                                {(l.lon_col ? [l.lon_col] : (l.prop_names || [])).map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label>Kolom Latitude / Y</label>
                              <select value={lats[l.name] || l.lat_col || ""} onChange={(e) => setLats({ ...lats, [l.name]: e.target.value })}>
                                {(l.lat_col ? [l.lat_col] : (l.prop_names || [])).map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <label>Simpan ke Project (opsional)</label>
                    <select value={project} onChange={(e) => setProject(e.target.value)}>
                      <option value="">— Tanpa project —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </details>

                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                  <button className="btn secondary" onClick={reset}>Batal</button>
                  <button className="btn" style={{ padding: "10px 28px", fontSize: 15 }} onClick={publish}>Publish</button>
                </div>
              </>
            )}

            {phase === "error" && (
              <div>
                <div className="err">{message}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn secondary" onClick={reset}>Tutup</button>
                  <button className="btn" onClick={() => setPhase("pick")}>Pilih file lain</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}