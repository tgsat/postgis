import maplibregl from "maplibre-gl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

const BASEMAPS = {
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  carto_light: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  carto_dark: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const PALETTE = ["#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#a78bfa", "#34d399", "#facc15"];
const TAB = { overview: "Overview", data: "Data", settings: "Settings" };
const SHARING = [
  { v: "private", label: "Private" },
  { v: "organization", label: "Organization" },
  { v: "public", label: "Public" },
];

function toGeojson(features) {
  return {
    type: "FeatureCollection",
    features: (features || []).map((f) => ({
      type: "Feature",
      properties: { ...(f.props || {}), feature_id: f.id },
      geometry: f.geom,
    })),
  };
}

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [mapInfo, setMapInfo] = useState(null);
  const [features, setFeatures] = useState([]);
  const [tab, setTab] = useState("overview");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [basemap, setBasemap] = useState("carto_light");
  const [color, setColor] = useState(PALETTE[Number(id) % PALETTE.length]);
  const [labelField, setLabelField] = useState("");
  const [filterExpr, setFilterExpr] = useState("");
  const [selId, setSelId] = useState(null);
  const [drawMode, setDrawMode] = useState(null);
  const [drawType, setDrawType] = useState("Point");
  const [wmModal, setWmModal] = useState(null);
  const [projects, setProjects] = useState([]);
  const [maps, setMaps] = useState([]);
  const [delConfirm, setDelConfirm] = useState(false);
  const [protectedTyping, setProtectedTyping] = useState("");

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawVertsRef = useRef([]);

  const fields = useMemo(() => {
    if (!item) return [];
    if (item.item_type === "feature_layer") {
      return (dataset?.schema?.fields) || [];
    }
    return [];
  }, [item, dataset]);

  const projectsRef = useRef(projects);

  useEffect(() => {
    api.get(`/items/${id}/`).then((i) => {
      setItem(i);
    }).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    if (!item) return;
    if (item.item_type === "feature_layer" && item.dataset_id) {
      api.get(`/datasets/${item.dataset_id}/`).then((d) => {
        setDataset(d);
        api.get("/features/", { dataset: item.dataset_id, page_size: 10000 }).then((data) => {
          setFeatures(Array.isArray(data) ? data : data.results || []);
        }).catch((e) => setErr(e.message));
      }).catch((e) => setErr(e.message));
    } else if (item.item_type === "web_map" && item.map_id) {
      api.get(`/maps/${item.map_id}/`).then((m) => {
        setMapInfo(m);
        setBasemap(m.basemap || "carto_light");
      }).catch((e) => setErr(e.message));
    }
  }, [item]);

  useEffect(() => {
    if (item && item.item_type === "feature_layer") {
      api.get("/projects/", { page_size: 500 }).then((d) => setProjects(Array.isArray(d) ? d : d.results || [])).catch(() => {});
      api.get("/maps/", { page_size: 500 }).then((d) => setMaps(Array.isArray(d) ? d : d.results || [])).catch(() => {});
    }
  }, [item]);

  // ---- map lifecycle ----
  const geo = useMemo(() => (item?.item_type === "feature_layer" ? toGeojson(features) : null), [features, item]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || item?.item_type !== "feature_layer") return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: { type: "raster", tiles: [BASEMAPS[basemap]], tileSize: 256 },
          items: { type: "geojson", data: geo || { type: "FeatureCollection", features: [] } },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap", minzoom: 0, maxzoom: 19 },
        ],
      },
      center: [110.5, -2.5],
      zoom: 4,
    });
    mapRef.current = map;
    map.on("load", () => {
      map.on("click", (ev) => {
        if (drawMode) {
          handleMapClick(ev);
          return;
        }
        const b = [[ev.point.x - 5, ev.point.y - 5], [ev.point.x + 5, ev.point.y + 5]];
        const hits = map.queryRenderedFeatures(b, { layers: ["items-point", "items-line", "items-fill"] });
        if (hits.length) {
          setSelId(hits[0].properties.feature_id || hits[0].id);
        } else {
          setSelId(null);
        }
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.item_type]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo || item?.item_type !== "feature_layer") return;
    if (!map.isStyleLoaded()) return;
    try {
      const src = map.getSource("items");
      if (src) src.setData(geo);
      const id = map.getSource("basemap") ? map.getSource("basemap").setTiles([BASEMAPS[basemap]]) : null;
      if (map.getStyle().sources.basemap) id;
    } catch (e) {
      /* style not ready */
    }
    const ensureLayer = (layerId, type, paint) => {
      if (!map.getLayer(layerId)) {
        map.addLayer({ id: layerId, type, source: "items", paint });
      }
      if (map.getFilter(layerId)) map.setFilter(layerId, null);
    };
    if (item?.geom_type === "Point" || item?.geom_type === "MultiPoint") {
      ensureLayer("items-point", "circle", { "circle-color": color, "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 1 });
      map.removeLayer("items-line"); map.removeLayer("items-fill");
    } else if (item?.geom_type === "LineString" || item?.geom_type === "MultiLineString") {
      ensureLayer("items-line", "line", { "line-color": color, "line-width": 2.5 });
      map.removeLayer("items-point"); map.removeLayer("items-fill");
    } else {
      ensureLayer("items-fill", "fill", { "fill-color": color, "fill-opacity": 0.3 });
      ensureLayer("items-line", "line", { "line-color": color, "line-width": 2 });
      map.removeLayer("items-point");
    }
    if (!map.getLayer("items-highlight")) {
      map.addLayer({
        id: "items-highlight", type: "line", source: "items",
        paint: { "line-color": "#f59e0b", "line-width": 3 },
        filter: ["==", ["get", "feature_id"], "__none__"],
      });
    }
    map.setFilter("items-highlight", selId ? ["==", ["get", "feature_id"], selId] : ["==", ["get", "feature_id"], "__none__"]);
    if (labelField && map.getLayer("items-label")) map.removeLayer("items-label");
    if (labelField && !map.getLayer("items-label")) {
      map.addLayer({
        id: "items-label", type: "symbol", source: "items",
        layout: { "text-field": ["get", labelField], "text-font": ["Open Sans Regular"], "text-size": 11, "text-offset": [0, -1] },
        paint: { "text-color": "#0f172a", "text-halo-color": "#fff", "text-halo-width": 1.5 },
      });
    }
    let expr = null;
    if (filterExpr) {
      const m = filterExpr.match(/^(\w+)\s*(==|=|!=|<=|>=|<|>)\s*(.+)$/);
      if (m && ["==", "!=", "<=", ">=", "<", ">"].includes(m[2])) {
        const val = m[3].replace(/^['"]|['"]$/g, "");
        const num = Number(val);
        const right = Number.isNaN(num) ? val : num;
        expr = [m[2], ["get", m[1]], right];
      }
    }
    ["items-point", "items-line", "items-fill"].forEach((l) => {
      if (map.getLayer(l)) {
        if (!map.getFilter(l) && expr) map.setFilter(l, expr);
        else if (map.getFilter(l) && !expr) map.setFilter(l, null);
        else if (map.getFilter(l) && expr) map.setFilter(l, expr);
      }
    });
  }, [geo, basemap, color, labelField, filterExpr, selId, item, features]);

  const fitFeatures = () => {
    const map = mapRef.current;
    if (!map || !features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((f) => {
      if (!f.geom) return;
      if (f.geom.type === "Point") bounds.extend([f.geom.coordinates[0], f.geom.coordinates[1]]);
      else f.geom.coordinates.flat(Infinity).forEach((c, i) => {
        if (i % 2 === 0 && typeof c === "number" && f.geom.coordinates && Array.isArray(f.geom.coordinates[0])) {
          bounds.extend([f.geom.coordinates[0][0], f.geom.coordinates[0][1]]);
        }
      });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40 });
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const selectRow = async (f) => {
    setSelId(f.id);
    const map = mapRef.current;
    if (map && f.geom) {
      if (f.geom.type === "Point") map.flyTo({ center: [f.geom.coordinates[0], f.geom.coordinates[1]], zoom: Math.max(map.getZoom(), 14) });
      else {
        const c = f.geom.coordinates[0];
        if (Array.isArray(c)) map.flyTo({ center: [c[0], c[1]], zoom: Math.max(map.getZoom(), 14) });
      }
    }
  };

  const editProp = (f, key, val) => {
    const props = { ...f.props, [key]: val };
    api.patch(`/features/${f.id}/`, { props }).then(() => {
      setFeatures((list) => list.map((x) => (x.id === f.id ? { ...x, props } : x)));
      setOkMsg("Perubahan tersimpan.");
      setTimeout(() => setOkMsg(""), 1800);
    }).catch((e) => setErr(e.message));
  };

  const delFeature = async (f) => {
    if (!window.confirm(`Hapus fitur #${f.id}?`)) return;
    try {
      await api.del(`/features/${f.id}/`);
      setFeatures((list) => list.filter((x) => x.id !== f.id));
      setSelId(null);
    } catch (e) {
      setErr(e.message);
    }
  };

  // ---- drawing ----
  const handleMapClick = (ev) => {
    const map = mapRef.current;
    const lngLat = map.unproject(ev.point);
    if (drawType === "Point") {
      submitGeometry({ type: "Point", coordinates: [lngLat.lng, lngLat.lat] });
      return;
    }
    drawVertsRef.current.push([lngLat.lng, lngLat.lat]);
    renderDraw();
  };

  const renderDraw = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = drawVertsRef.current;
    let geometry = null;
    if (drawType === "LineString" && coords.length >= 2) geometry = { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) };
    if (drawType === "Polygon" && coords.length >= 3) geometry = { type: "Polygon", coordinates: [coords.map((c) => [c[0], c[1]]), coords[0] ? [coords[0][0], coords[0][1]] : []] };
    const src = map.getSource("draw");
    if (!src) {
      map.addSource("draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#22d3ee", "line-width": 2 } });
      map.addLayer({ id: "draw-point", type: "circle", source: "draw", paint: { "circle-color": "#22d3ee", "circle-radius": 5 } });
    }
    map.getSource("draw").setData({
      type: "FeatureCollection",
      features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [],
    });
  };

  const submitGeometry = async (geometry) => {
    try {
      const created = await api.post(`/features/?dataset=${item.dataset_id}`, { geometry, properties: {} });
      setFeatures((list) => [...list, created]);
      drawVertsRef.current = [];
      setDrawMode(false);
      renderDraw();
    } catch (e) {
      setErr(e.message);
    }
  };

  const finishDraw = () => {
    if (drawType === "Point") return;
    const coords = drawVertsRef.current;
    let geometry = null;
    if (drawType === "LineString" && coords.length >= 2) geometry = { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) };
    if (drawType === "Polygon" && coords.length >= 3) {
      const pts = coords.map((c) => [c[0], c[1]]);
      geometry = { type: "Polygon", coordinates: [pts, pts[0]] };
    }
    if (!geometry) {
      setErr("Belum cukup vertex untuk menyelesaikan geometri.");
      return;
    }
    submitGeometry(geometry);
  };

  const cancelDraw = () => {
    drawVertsRef.current = [];
    setDrawMode(false);
    renderDraw();
  };

  // ---- web map actions ----
  const addToWebMap = async (payload) => {
    setBusy(true);
    try {
      const res = await api.post(`/items/${item.id}/add_to_web_map/`, payload);
      const list = await api.get("/items/", { item_type: "web_map", page_size: 500 });
      const found = (Array.isArray(list) ? list : list.results || []).find((i) => i.map_id === res.map_id);
      setWmModal(null);
      if (found) navigate(`/items/${found.id}`);
      else setOkMsg("Layer ditambahkan ke Web Map.");
      setTimeout(() => setOkMsg(""), 2000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- settings ----
  const saveSettings = async (patch, msg) => {
    setBusy(true);
    try {
      const i = await api.patch(`/items/${item.id}/`, patch);
      setItem(i);
      setOkMsg(msg || "Pengaturan disimpan.");
      setTimeout(() => setOkMsg(""), 2000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveFields = async () => {
    setBusy(true);
    try {
      await api.put(`/items/${item.id}/fields/`, { fields });
      const d = await api.get(`/datasets/${item.dataset_id}/`);
      setDataset(d);
      setOkMsg("Skema field & domain tersimpan.");
      setTimeout(() => setOkMsg(""), 2000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const updateField = (idx, key, val) => {
    setDataset((d) => {
      const f = [...d.schema.fields];
      f[idx] = { ...f[idx], [key]: val };
      return { ...d, schema: { ...d.schema, fields: f } };
    });
  };

  const deleteItem = async () => {
    if (item.delete_protection) {
      setErr("Item dilindungi oleh Delete Protection. Nonaktifkan proteksi terlebih dahulu di tab Settings.");
      setDelConfirm(false);
      return;
    }
    try {
      await api.del(`/items/${item.id}/`);
      navigate("/content");
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!item) {
    return (
      <>
        <div className="topbar"><div className="h1">Item Detail</div></div>
        {err && <div className="err">{err}</div>}
        <div className="spinner" />
      </>
    );
  }

  const isProtected = item.delete_protection;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">{item.title} <span style={{ fontWeight: 400, fontSize: 14 }} className="muted">({item.display_title || item.title})</span></div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge gray">{item.item_type === "feature_layer" ? "Feature Layer" : "Web Map"}</span>
            {item.hosted && <span className="badge blue">hosted</span>}
            <span className={"badge " + (item.sharing_level === "public" ? "green" : item.sharing_level === "organization" ? "blue" : "gray")}>
              {item.sharing_level}
            </span>
            <span className="muted">{item.owner_name} · {new Date(item.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {item.item_type === "feature_layer" && (
            <>
              <Link className="btn secondary" to="/maps"><span style={{ display: "block" }}>Open in Map Viewer</span></Link>
              <button className="btn secondary" onClick={() => setWmModal("new")}>Add to New Web Map</button>
              <button className="btn secondary" onClick={() => setWmModal("existing")}>Add to Existing Web Map</button>
            </>
          )}
          {item.item_type === "web_map" && item.map_id && (
            <Link className="btn" to={`/maps?map=${item.map_id}`}><span style={{ display: "block" }}>Open in Map Viewer</span></Link>
          )}
          <button className="btn" onClick={() => navigate("/content")}>Back</button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      {okMsg && <div className="ok">{okMsg}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(TAB).map(([k, v]) => (
          <button key={k} className="btn secondary small" style={tab === k ? { background: "var(--accent-2)", color: "#fff" } : {}}
            onClick={() => { setTab(k); setDelConfirm(false); setErr(""); }}>
            {v}
          </button>
        ))}
      </div>

      {tab === "overview" && item.item_type === "feature_layer" && (
        <>
          <div className="grid" style={{ gridTemplateColumns: "260px 1fr" }}>
            <div className="card" style={{ alignSelf: "start" }}>
              <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Sidebar</div>
              <label>Add Basemap</label>
              <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
                <option value="osm">OpenStreetMap</option>
                <option value="carto_light">Carto Light</option>
                <option value="carto_dark">Carto Dark</option>
                <option value="satellite">Satellite</option>
              </select>
              <label>Symbology — Warna</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: "100%", height: 36, padding: 2 }} />
              <label>Custom Label — field</label>
              <select value={labelField} onChange={(e) => setLabelField(e.target.value)}>
                <option value="">— Tanpa label —</option>
                {fields.map((f) => <option key={f.name} value={f.name}>{f.label || f.name}</option>)}
              </select>
              <label>Custom Filter</label>
              <input placeholder="mis. kondisi = 'RUSAK'" value={filterExpr} onChange={(e) => setFilterExpr(e.target.value)} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn secondary small" onClick={() => setOkMsg("Konfigurasi tersimpan") || setTimeout(() => setOkMsg(""), 1500)}>Save</button>
                <button className="btn secondary small" onClick={() => setWmModal("saveas")}>Save As...</button>
              </div>
            </div>
            <div className="map-wrap" style={{ height: 440, position: "relative" }}>
              <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
              <div className="marker-menu">
                {!drawMode ? (
                  <select value={drawType} onChange={(e) => setDrawType(e.target.value)} style={{ width: 110 }}>
                    <option value="Point">Point</option>
                    <option value="LineString">Line</option>
                    <option value="Polygon">Polygon</option>
                  </select>
                ) : null}
                {!drawMode ? (
                  <button className="btn small" onClick={() => { drawVertsRef.current = []; setDrawMode(true); }}>+ Add Feature</button>
                ) : (
                  <>
                    <button className="btn small" onClick={drawType === "Point" ? cancelDraw : finishDraw} disabled={drawType !== "Point" && drawVertsRef.current.length < 2}>
                      {drawType === "Point" ? "Batalkan" : "Finish"}
                    </button>
                    <button className="btn danger small" onClick={cancelDraw}>Cancel</button>
                  </>
                )}
                <button className="btn secondary small" onClick={fitFeatures}>Zoom ke Data</button>
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div className="h1" style={{ fontSize: 16 }}>Data Table — {dataset?.name}</div>
              <div className="muted">{features.length.toLocaleString()} fitur · klik baris untuk zoom ke peta</div>
            </div>
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    {fields.map((f) => <th key={f.name}>{f.label || f.name}</th>)}
                    <th style={{ textAlign: "right" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.id} style={{ cursor: "pointer", background: selId === f.id ? "var(--bg-accent)" : undefined }}
                      onClick={(e) => { if (e.target.tagName === "INPUT") return; selectRow(f); }}>
                      <td>{f.id}</td>
                      {fields.map((fl) => (
                        <td key={fl.name}>
                          <input
                            style={{ minWidth: 90, padding: "5px 8px", fontSize: 13 }}
                            defaultValue={f.props ? (f.props[fl.name] ?? "") : ""}
                            onBlur={(e) => { if (String(e.target.defaultValue) !== String(e.target.value)) editProp(f, fl.name, e.target.value); }}
                          />
                        </td>
                      ))}
                      <td style={{ textAlign: "right" }}>
                        <button className="btn danger small" onClick={() => delFeature(f)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "overview" && item.item_type === "web_map" && (
        <div className="card">
          <div className="h1" style={{ fontSize: 16 }}>Web Map — {item.title}</div>
          <div className="muted" style={{ marginBottom: 10 }}>Basemap: {mapInfo?.basemap || item.map_basemap}</div>
          <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>Layer terpakai</div>
          <table>
            <thead>
              <tr><th>Layer</th><th>Type</th><th>Fitur</th></tr>
            </thead>
            <tbody>
              {(mapInfo?.layers || []).map((l, i) => (
                <tr key={i}>
                  <td>{l.dataset_name}</td>
                  <td className="muted">{l.dataset_geom_type}</td>
                  <td className="muted">{Number(l.feature_count || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "data" && item.item_type === "feature_layer" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div className="h1" style={{ fontSize: 16 }}>Fields &amp; Domain</div>
              <div className="muted">Ubah skema atribut layer. Kolom Domain dipisahkan koma (coded value).</div>
            </div>
            <button className="btn" onClick={saveFields} disabled={busy}>Simpan Field</button>
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Nama Field</th>
                  <th>Label</th>
                  <th>Tipe</th>
                  <th>Panjang</th>
                  <th>Default</th>
                  <th>Wajib</th>
                  <th>Domain</th>
                  <th style={{ textAlign: "right" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, idx) => (
                  <tr key={f.name + idx}>
                    <td>
                      <span className="muted">{f.name}</span>
                      <input value={f.name} onChange={(e) => updateField(idx, "name", e.target.value)} style={{ marginTop: 4 }} />
                    </td>
                    <td><input value={f.label || ""} onChange={(e) => updateField(idx, "label", e.target.value)} /></td>
                    <td>
                      <select value={f.type || "text"} onChange={(e) => updateField(idx, "type", e.target.value)}>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </td>
                    <td><input type="number" value={f.length || ""} onChange={(e) => updateField(idx, "length", e.target.value ? Number(e.target.value) : null)} /></td>
                    <td><input value={f.default ?? ""} onChange={(e) => updateField(idx, "default", e.target.value)} /></td>
                    <td><input type="checkbox" checked={!!f.required} onChange={(e) => updateField(idx, "required", e.target.checked)} /></td>
                    <td>
                      <input value={(f.domain || []).join(", ")} onChange={(e) => updateField(idx, "domain", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                        placeholder="NORMAL, RUSAK, MAINTENANCE" />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn danger small" onClick={() => setDataset((d) => ({ ...d, schema: { ...d.schema, fields: d.schema.fields.filter((_, i) => i !== idx) } }))}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn secondary small" style={{ marginTop: 12 }} onClick={() => {
            setDataset((d) => ({ ...d, schema: { ...d.schema, fields: [...d.schema.fields, { name: "field_baru", label: "Field Baru", type: "text", required: false, domain: [] }] } }));
          }}>+ Add Field</button>
        </div>
      )}

      {tab === "settings" && (
        <div className="grid grid-2">
          <div className="card">
            <div className="h1" style={{ fontSize: 16 }}>Sharing</div>
            <div style={{ marginTop: 8 }}>
              {SHARING.map((s) => (
                <label className="switch" key={s.v}>
                  <input type="radio" name="sharing" checked={item.sharing_level === s.v}
                    onChange={() => saveSettings({ sharing_level: s.v }, `Sharing diubah: ${s.label}`)} />
                  <span className="check-label">{s.label}</span>
                </label>
              ))}
            </div>
            <div className="divider" />
            <div className="h1" style={{ fontSize: 16 }}>Judul &amp; Tags</div>
            <label>Title</label>
            <input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} />
            <label>Tags (koma)</label>
            <input value={(item.tags || []).join(", ")} onChange={(e) => setItem({ ...item, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
            <button className="btn" style={{ marginTop: 12 }} onClick={() => saveSettings({ title: item.title, tags: item.tags })}>Simpan Judul &amp; Tags</button>
          </div>

          <div className="card">
            <div className="h1" style={{ fontSize: 16 }}>Proteksi Item</div>
            <label className="switch">
              <input type="checkbox" checked={isProtected} onChange={async (e) => {
                if (e.target.checked) {
                  const typed = window.prompt("Ketik judul item untuk mengaktifkan Delete Protection:", "");
                  if (typed && typed === item.title) await saveSettings({ delete_protection: true }, "Delete Protection aktif.");
                  else if (typed) setErr("Nama tidak cocok. Proteksi tidak diaktifkan.");
                } else {
                  await saveSettings({ delete_protection: false }, "Delete Protection nonaktif.");
                }
              }} />
              <span className="check-label">Aktifkan "Delete Protection" — item tidak dapat dihapus secara tidak sengaja</span>
            </label>
            <div className="muted" style={{ marginBottom: 10 }}>Jika aktif, tombol Hapus Item tidak akan bisa menghapus item ini.</div>
            <div className="divider" />
            <div className="h1" style={{ fontSize: 16 }}>Zona Berbahaya</div>
            {!delConfirm ? (
              <button className="btn danger" onClick={() => setDelConfirm(true)}>Hapus Item</button>
            ) : (
              <div>
                <div className="err">Item "{item.title}" akan dihapus permanen. Lanjutkan?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn secondary" onClick={() => setDelConfirm(false)}>Batal</button>
                  <button className="btn danger" onClick={deleteItem}>Hapus</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {wmModal && item.item_type === "feature_layer" && (
        <div className="modal">
          <div className="modal-box">
            <div className="h1" style={{ fontSize: 17 }}>
              {wmModal === "new" ? "Add to New Web Map" : wmModal === "saveas" ? "Save As... Web Map baru" : "Add to Existing Web Map"}
            </div>
            {wmModal !== "existing" ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const name = e.target.name.value.trim();
                const project = e.target.project.value;
                if (!name || !project) { setErr("Nama dan project wajib diisi."); return; }
                addToWebMap({ project: Number(project), name });
              }}>
                <label>Web Map Title</label>
                <input name="name" defaultValue={wmModal === "saveas" ? `${item.title} — Web Map` : `Peta ${item.title}`} required />
                <label>Project</label>
                <select name="project" required defaultValue="">
                  <option value="" disabled>Pilih project...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" className="btn secondary" onClick={() => setWmModal(null)}>Batal</button>
                  <button className="btn" disabled={busy}>{busy ? "Menyimpan..." : "Buat Web Map"}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault();
                const mapId = e.target.map.value;
                if (!mapId) { setErr("Pilih Web Map tujuan."); return; }
                addToWebMap({ map_id: Number(mapId) });
              }}>
                <label>Web Map tujuan</label>
                <select name="map" required defaultValue="">
                  <option value="" disabled>Pilih Web Map...</option>
                  {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" className="btn secondary" onClick={() => setWmModal(null)}>Batal</button>
                  <button className="btn" disabled={busy}>Tambahkan</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}