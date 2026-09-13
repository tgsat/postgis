import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const FIELD_TYPES = ["text", "number", "select", "textarea", "date", "boolean", "photo"];

const OFFLINE_KEY = "gd_offline_queue";

function clientId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function readOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function FormsPage() {
  const [forms, setForms] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [formObj, setFormObj] = useState({ name: "", company: "", description: "", target_dataset: "" });
  const [editing, setEditing] = useState(null);
  const [fields, setFields] = useState([{ key: "name", label: "Name", type: "text", required: true }]);
  const [activeForm, setActiveForm] = useState(null);
  const [fillForm, setFillForm] = useState(null);
  const [fillValues, setFillValues] = useState({});
  const [location, setLocation] = useState({ lat: "", lng: "" });
  const [gpsBusy, setGpsBusy] = useState(false);
  const [queueCount, setQueueCount] = useState(readOfflineQueue().length);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    api.get("/forms/forms/", { page_size: 500 }).then((d) => setForms(Array.isArray(d) ? d : (d.results || []))).catch((e) => setErr(e.message));
    api.get("/datasets/", { page_size: 500 }).then((d) => setDatasets(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
  };

  useEffect(load, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formObj, schema: fields };
      if (editing) await api.put(`/forms/forms/${editing}/`, payload);
      else await api.post("/forms/forms/", payload);
      setFormObj({ name: "", company: "", description: "", target_dataset: "" });
      setFields([{ key: "name", label: "Name", type: "text", required: true }]);
      setEditing(null);
      load();
      setOkMsg("Form saved.");
      setErr("");
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const loadSubmissions = (f) => {
    setActiveForm(f);
    api.get("/forms/submissions/", { form: f.id, page_size: 500 }).then((d) => setSubmissions(Array.isArray(d) ? d : (d.results || []))).catch((e) => setErr(e.message));
  };

  const addField = () => setFields([...fields, { key: `field_${fields.length + 1}`, label: "Field", type: "text", required: false }]);
  const setField = (i, k, v) => setFields(fields.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  const openFill = (f) => {
    setFillForm(f);
    setFillValues({});
    setLocation({ lat: "", lng: "" });
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      setErr("Geolocation is not supported in this browser.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        setGpsBusy(false);
        setErr("");
      },
      (geoErr) => {
        setGpsBusy(false);
        setErr(`GPS error: ${geoErr.message}`);
      }
    );
  };

  const submitOffline = (sid) => {
    const queue = readOfflineQueue();
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue.filter((q) => q.client_id !== sid)));
    setQueueCount(readOfflineQueue().length);
  };

  const submitFill = async (e) => {
    e.preventDefault();
    if (!fillForm) return;
    const data = {};
    (fillForm.schema || []).forEach((fld) => {
      let v = fillValues[fld.key];
      if (fld.type === "number" && v !== "" && v != null) v = Number(v);
      if (fld.type === "boolean") v = !!v;
      data[fld.key] = v ?? "";
    });
    const payload = {
      form: fillForm.id,
      data,
      client_id: clientId(),
    };
    if (location.lat && location.lng) {
      payload.location = { type: "Point", coordinates: [Number(location.lng), Number(location.lat)] };
    }
    try {
      await api.post("/forms/submissions/", payload);
      setOkMsg("Submission received" + (payload.location ? " and synced to the target dataset." : "."));
      setErr("");
      setFillForm(null);
      if (activeForm) loadSubmissions(activeForm);
    } catch (e2) {
      const queue = readOfflineQueue();
      queue.push(payload);
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
      setQueueCount(queue.length);
      setErr(`Offline — submission saved locally (pending sync): ${e2.message}`);
    }
  };

  const flushOffline = async () => {
    const queue = readOfflineQueue();
    if (!queue.length) return;
    setSyncing(true);
    let done = 0;
    for (const item of queue) {
      try {
        await api.post("/forms/submissions/", item);
        submitOffline(item.client_id);
        done++;
      } catch (e) {
        setErr(`Sync stopped: ${e.message} (${queue.length - done} remaining).`);
        break;
      }
    }
    setSyncing(false);
    if (done) {
      setOkMsg(`Synced ${done} offline submission${done === 1 ? "" : "s"}.`);
      load();
      if (activeForm) loadSubmissions(activeForm);
    }
  };

  const renderFieldInput = (fld, i) => {
    const v = fillValues[fld.key] ?? "";
    switch (fld.type) {
      case "number":
        return <input type="number" value={v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.value })} required={fld.required} />;
      case "select":
        return (
          <select value={v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.value })} required={fld.required}>
            <option value="">— select —</option>
            {(fld.options || ["Yes", "No"]).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case "boolean":
        return (
          <label className="switch">
            <input type="checkbox" checked={!!v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.checked })} />
            <span className="check-label">{v ? "true" : "false"}</span>
          </label>
        );
      case "date":
        return <input type="date" value={v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.value })} required={fld.required} />;
      case "textarea":
        return <textarea rows={3} value={v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.value })} required={fld.required} />;
      default:
        return <input value={v} onChange={(e) => setFillValues({ ...fillValues, [fld.key]: e.target.value })} required={fld.required} />;
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Forms &amp; Survey</div>
          <div className="muted">Design data collection forms (Survey123-style engine)</div>
        </div>
        {queueCount > 0 && (
          <button className="btn" onClick={flushOffline} disabled={syncing}>
            {syncing ? "Syncing…" : `Sync offline (${queueCount})`}
          </button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
      {okMsg && <div className="ok">{okMsg}</div>}
      <div className="grid" style={{ gridTemplateColumns: "var(--form-cols)" }}>
        <div className="card">
          <div className="h1" style={{ fontSize: 16 }}>{editing ? "Edit form" : "New form"}</div>
          <form onSubmit={save}>
            <label>Name</label>
            <input value={formObj.name} onChange={(e) => setFormObj({ ...formObj, name: e.target.value })} required />
            <label>Description</label>
            <textarea value={formObj.description} onChange={(e) => setFormObj({ ...formObj, description: e.target.value })} />
            <label>Target Dataset (optional)</label>
            <select value={formObj.target_dataset} onChange={(e) => setFormObj({ ...formObj, target_dataset: e.target.value })}>
              <option value="">None</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label>Fields</label>
            {fields.map((fld, i) => (
              <div key={i} className="table-scroll" style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={fld.key} placeholder="key" onChange={(e) => setField(i, "key", e.target.value)} style={{ width: 100, flexShrink: 0 }} />
                <input value={fld.label} placeholder="label" onChange={(e) => setField(i, "label", e.target.value)} style={{ flex: 1, minWidth: 80 }} />
                <select value={fld.type} onChange={(e) => setField(i, "type", e.target.value)} style={{ width: 100, flexShrink: 0 }}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" className="btn danger small" style={{ flexShrink: 0 }} onClick={() => setFields(fields.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="btn secondary small" onClick={addField}>+ Add field</button>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn">{editing ? "Save" : "Create"}</button>
              {editing && <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>}
            </div>
          </form>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div className="h1" style={{ fontSize: 16 }}>Forms</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Name</th><th>Fields</th><th>Submissions</th><th>Status</th><th style={{ textAlign: "right", minWidth: 190 }}>Actions</th></tr>
              </thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.name}</strong><div className="muted">{f.description}</div></td>
                    <td>{(f.schema || []).length}</td>
                    <td>{f.submission_count ?? 0}</td>
                    <td>{f.is_active ? <span className="badge green">Active</span> : <span className="badge gray">Inactive</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button className="btn accent small" onClick={() => openFill(f)}>Fill</button>
                        <button className="btn secondary small" onClick={() => loadSubmissions(f)}>Submissions</button>
                        <button className="btn secondary small" onClick={() => { setEditing(f.id); setFormObj({ name: f.name, description: f.description, target_dataset: f.target_dataset || "" }); setFields(f.schema || []); }}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeForm && (
            <>
              <div className="divider" />
              <div className="h1" style={{ fontSize: 16 }}>Submissions — {activeForm.name}</div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Data</th><th>Location</th><th>Feature</th><th>Synced</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td><pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(s.data)}</pre></td>
                        <td className="muted">{s.location ? "yes" : "no"}</td>
                        <td>{s.feature ? <span className="pill">#{s.feature}</span> : <span className="muted">—</span>}</td>
                        <td>{s.is_synced ? <span className="badge green">Synced</span> : <span className="badge orange">Pending</span>}</td>
                        <td className="muted">{new Date(s.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {fillForm && (
        <div className="modal">
          <div className="modal-box">
            <div className="h1" style={{ fontSize: 17 }}>Fill form — {fillForm.name}</div>
            <div className="muted">{fillForm.description}</div>
            <form onSubmit={submitFill}>
              {(fillForm.schema || []).map((fld, i) => (
                <div key={i}>
                  <label>{fld.label || fld.key}{fld.required ? " *" : ""}</label>
                  {renderFieldInput(fld, i)}
                </div>
              ))}
              <label style={{ marginTop: 12 }}>Location <span className="muted">(optional)</span></label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" step="any" placeholder="lat" value={location.lat} onChange={(e) => setLocation({ ...location, lat: e.target.value })} />
                <input type="number" step="any" placeholder="lng" value={location.lng} onChange={(e) => setLocation({ ...location, lng: e.target.value })} />
              </div>
              <button type="button" className="btn secondary small" style={{ marginTop: 8 }} onClick={useGps} disabled={gpsBusy}>
                {gpsBusy ? "Locating…" : "Use my location"}
              </button>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn" type="submit">Submit</button>
                <button type="button" className="btn secondary" onClick={() => setFillForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}