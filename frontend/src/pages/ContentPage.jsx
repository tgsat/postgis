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

function pollJob(id, onStatus) {
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const job = await api.get(`/upload-jobs/${id}/`);
        if (["ready", "success", "failed"].includes(job.status)) {
          clearInterval(timer);
          resolve(job);
        } else {
          onStatus && onStatus(job);
        }
      } catch (e) {
        clearInterval(timer);
        resolve({ status: "failed", error: e.message });
      }
    }, 2000);
  });
}

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
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState("upload");
  const [job, setJob] = useState(null);
  const [file, setFile] = useState(null);
  const [company, setCompany] = useState("");
  const [project, setProject] = useState("");
  const [layersSel, setLayersSel] = useState([]);
  const [selected, setSelected] = useState({});
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

  const resetWizard = () => {
    setOpen(false);
    setStep("upload");
    setJob(null);
    setFile(null);
    setCompany("");
    setProject("");
    setLayersSel([]);
    setSelected({});
    setErr("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const startUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    if (company) fd.append("company", company);
    try {
      const j = await api.upload("/upload-jobs/", fd);
      setJob(j);
      setStep("analyzing");
      const done = await pollJob(j.id, (cur) => setJob(cur));
      setJob(done);
      if (done.status === "failed") {
        setStep("failed");
        setErr(done.error || "Analisis file gagal.");
        return;
      }
      setLayersSel([...done.layers]);
      setSelected({});
      setStep("configure");
    } catch (e2) {
      setErr(e2.message);
      setStep("failed");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const chosen = layersSel.filter((l) => selected[l.name] !== false);
    const req = chosen.map((l) => ({
      name: l.name,
      title: selected[`title_${l.name}`] || l.title,
      lon_col: selected[`lon_${l.name}`] || l.lon_col,
      lat_col: selected[`lat_${l.name}`] || l.lat_col,
    }));
    try {
      await api.post(`/upload-jobs/${job.id}/publish/`, {
        layers: req,
        project: project || null,
        field_mapping: {},
      });
      setStep("publishing");
      const done = await pollJob(job.id, (cur) => setJob(cur));
      setJob(done);
      if (done.status === "success") {
        const first = done.item_ids && done.item_ids[0];
        resetWizard();
        if (first) {
          navigate(`/items/${first}`);
        }
      } else {
        setStep("failed");
        setErr(done.error || "Publish gagal.");
      }
    } catch (e2) {
      setErr(e2.message);
      setStep("failed");
    } finally {
      setBusy(false);
    }
  };

  const sharingBadge = (lvl) => {
    const cls = lvl === "public" ? "green" : lvl === "organization" ? "blue" : "gray";
    return <span className={`badge ${cls}`}>{lvl === "organization" ? "Org" : lvl}</span>;
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Content</div>
          <div className="muted">Item hosted — Feature Layer &amp; Web Map</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>+ Add Data</button>
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
        {visible.length === 0 && <div className="muted" style={{ padding: 12 }}>Belum ada item. Klik "+ Add Data" untuk meng-upload data spasial.</div>}
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
                    <td>{sharingBadge(i.sharing_level)}</td>
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
        <div className="modal">
          <div className="modal-box" style={{ width: 620 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="h1" style={{ fontSize: 17 }}>Add Data</div>
              <button className="btn secondary icon" onClick={resetWizard}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
              {["upload", "analyzing", "configure", "publishing"].map((s, idx) => (
                <span key={s} className="badge" style={{ background: step === s ? "var(--accent-2)" : "var(--panel-2)", color: step === s ? "#fff" : "var(--muted)" }}>
                  {idx + 1}. {s === "upload" ? "Upload" : s === "analyzing" ? "Analisis" : s === "configure" ? "Publikasi" : "Proses"}
                </span>
              ))}
            </div>
            <div className="divider" style={{ margin: "8px 0" }} />

            {step === "upload" && (
              <form onSubmit={startUpload}>
                <label>Pilih File</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] || null); }}
                  style={{ border: "2px dashed " + (drag ? "var(--accent-2)" : "var(--border)"), borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer", background: drag ? "var(--bg-accent)" : "var(--bg-2)" }}
                  onClick={() => fileRef.current && fileRef.current.click()}
                >
                  {file ? (
                    <strong>{file.name}</strong>
                  ) : (
                    <>
                      <div style={{ fontSize: 26 }}>⇧</div>
                      <div>Drag &amp; drop file di sini atau <span className="ok">Browse</span></div>
                      <div className="muted" style={{ marginTop: 6 }}>.zip (SHP/GDB), .gpkg, .csv, .xlsx — maks 200 MB</div>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept=".zip,.gpkg,.csv,.xlsx" style={{ display: "none" }}
                    onChange={(e) => setFile(e.target.files[0] || null)} />
                </div>
                {isSystemAdmin && (
                  <>
                    <label>Company</label>
                    <select value={company} onChange={(e) => setCompany(e.target.value)} required>
                      <option value="">Pilih company...</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" className="btn secondary" onClick={resetWizard}>Batal</button>
                  <button className="btn" disabled={busy || !file}>{busy ? "Mengupload..." : "Upload & Analisis"}</button>
                </div>
              </form>
            )}

            {step === "analyzing" && (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div className="spinner" />
                <div className="muted">Menganalisis file "{job?.file_name}" — membaca layer, geometri, CRS, dan field...</div>
              </div>
            )}

            {step === "configure" && job && (
              <form onSubmit={publish}>
                <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>Layer terdeteksi</div>
                {layersSel.map((l) => (
                  <div key={l.name} className="card" style={{ padding: 12, marginBottom: 10, boxShadow: "none" }}>
                    <label className="switch">
                      <input type="checkbox" checked={selected[l.name] !== false}
                        onChange={(e) => setSelected((s) => ({ ...s, [l.name]: e.target.checked ? undefined : false }))} />
                      <span className="check-label">
                        {l.name} — <span className="badge blue">{l.geom_type}</span>{" "}
                        <span className="muted">EPSG:{l.crs || "?"} · {Number(l.feature_count || 0).toLocaleString()} fitur</span>
                      </span>
                    </label>
                    <label>Nama Layer (judul item)</label>
                    <input value={selected[`title_${l.name}`] || l.title}
                      onChange={(e) => setSelected((s) => ({ ...s, [`title_${l.name}`]: e.target.value }))} />
                    {(l.geom_type === "Point" || l.table_kind === "tabular") && (
                      <div className="grid grid-2">
                        <div>
                          <label>Kolom Longitude / X</label>
                          <select value={selected[`lon_${l.name}`] || l.lon_col || ""}
                            onChange={(e) => setSelected((s) => ({ ...s, [`lon_${l.name}`]: e.target.value }))}>
                            {(l.lon_col ? [l.lon_col] : (l.prop_names || [])).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label>Kolom Latitude / Y</label>
                          <select value={selected[`lat_${l.name}`] || l.lat_col || ""}
                            onChange={(e) => setSelected((s) => ({ ...s, [`lat_${l.name}`]: e.target.value }))}>
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

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" className="btn secondary" onClick={resetWizard}>Batal</button>
                  <button className="btn" disabled={busy}>{busy ? "Mempublikasi..." : "Publish"}</button>
                </div>
              </form>
            )}

            {step === "publishing" && (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div className="spinner" />
                <div className="muted">Mempublikasi ke PostGIS melalui pipeline Celery...</div>
              </div>
            )}

            {step === "failed" && (
              <div>
                <div className="err">{err || "Terjadi kesalahan saat memproses file."}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn secondary" onClick={resetWizard}>Tutup</button>
                  {job && <button className="btn" onClick={() => { setStep("upload"); setJob(null); }}>Upload ulang</button>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}