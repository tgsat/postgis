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
  const [drawMode, setDrawMode] = useState(false);
  const [drawType, setDrawType] = useState("Point");
  const [showStyle, setShowStyle] = useState(false);
  const [wmModal, setWmModal] = useState(null);
  const [projects, setProjects] = useState([]);
  const [maps, setMaps] = useState([]);
  const [delConfirm, setDelConfirm] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawVertsRef = useRef([]);

  const fields = useMemo(() => {
    return (item?.item_type === "feature_layer" && dataset?.schema?.fields) || [];
  }, [item, dataset]);

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

  const geo = useMemo(() => (item?.item_type === "feature_layer" ? toGeojson(features) : null), [features, item]);

  // ---- map lifecycle ----
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
        setSelId(hits.length ? hits[0].properties.feature_id : null);
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
      if (map.getStyle().sources.basemap) map.getSource("basemap").setTiles([BASEMAPS[basemap]]);
    } catch (e) { /* style not ready */ }

    const ensure = (layerId, type, paint) => {
      if (!map.getLayer(layerId)) map.addLayer({ id: layerId, type, source: "items", paint });
    };
    if (item?.geom_type === "Point" || item?.geom_type === "MultiPoint") {
      ensure("items-point", "circle", { "circle-color": color, "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 1 });
      map.removeLayer("items-line"); map.removeLayer("items-fill");
    } else if (item?.geom_type === "LineString" || item?.geom_type === "MultiLineString") {
      ensure("items-line", "line", { "line-color": color, "line-width": 2.5 });
      map.removeLayer("items-point"); map.removeLayer("items-fill");
    } else {
      ensure("items-fill", "fill", { "fill-color": color, "fill-opacity": 0.3 });
      ensure("items-line", "line", { "line-color": color, "line-width": 2 });
      map.removeLayer("items-point");
    }

    if (!map.getLayer("items-highlight")) {
      map.addLayer({ id: "items-highlight", type: "line", source: "items", paint: { "line-color": "#f59e0b", "line-width": 3 }, filter: ["==", ["get", "feature_id"], "__none__"] });
    }
    map.setFilter("items-highlight", selId ? ["==", ["get", "feature_id"], selId] : ["==", ["get", "feature_id"], "__none__"]);

    if (labelField && !map.getLayer("items-label")) {
      map.addLayer({
        id: "items-label", type: "symbol", source: "items",
        layout: { "text-field": ["get", labelField], "text-font": ["Open Sans Regular"], "text-size": 11, "text-offset": [0, -1] },
        paint: { "text-color": "#0f172a", "text-halo-color": "#fff", "text-halo-width": 1.5 },
      });
    }
    if (map.getLayer("items-label") && !labelField) map.removeLayer("items-label");

    let expr = null;
    if (filterExpr) {
      const m = filterExpr.match(/^(\w+)\s*(==|=|!=|<=|>=|<|>)\s*(.+)$/);
      if (m && ["==", "!=", "<=", ">=", "<", ">"].includes(m[2])) {
        const raw = m[3].replace(/^['"]|['"]$/g, "");
        const num = Number(raw);
        expr = [m[2], ["get", m[1]], Number.isNaN(num) ? raw : num];
      }
    }
    ["items-point", "items-line", "items-fill"].forEach((l) => {
      if (map.getLayer(l)) {
        const cur = map.getFilter(l);
        if (cur && !expr) map.setFilter(l, null);
        else if (!cur && expr) map.setFilter(l, expr);
        else if (cur && expr) map.setFilter(l, expr);
      }
    });
  }, [geo, basemap, color, labelField, filterExpr, selId, item]);

  const fitFeatures = () => {
    const map = mapRef.current;
    if (!map || !features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((f) => {
      if (!f.geom) return;
      if (f.geom.type === "Point") bounds.extend([f.geom.coordinates[0], f.geom.coordinates[1]]);
      else {
        const pts = f.geom.type === "Polygon" ? f.geom.coordinates[0] : (f.geom.type === "MultiPolygon" ? f.geom.coordinates[0]?.[0] : f.geom.coordinates);
        (Array.isArray(pts) ? pts : [f.geom.coordinates[0]]).forEach((c) => { if (Array.isArray(c) && typeof c[0] === "number") bounds.extend([c[0], c[1]]); });
      }
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40 });
  };

  const selectRow = async (f) => {
    setSelId(f.id);
    const map = mapRef.current;
    if (map && f.geom) {
      if (f.geom.type === "Point") map.flyTo({ center: [f.geom.coordinates[0], f.geom.coordinates[1]], zoom: Math.max(map.getZoom(), 14) });
      else {
        const c = f.geom.type === "Polygon" ? f.geom.coordinates[0]?.[0] : f.geom.coordinates?.[0];
        if (Array.isArray(c)) map.flyTo({ center: [c[0], c[1]], zoom: Math.max(map.getZoom(), 14) });
      }
    }
  };

  const editProp = (f, key, val) => {
    const props = { ...f.props, [key]: val };
    api.patch(`/features/${f.id}/`, { props }).then(() => {
      setFeatures((list) => list.map((x) => (x.id === f.id ? { ...x, props } : x)));
      setOkMsg("Tersimpan.");
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
    if (drawType === "Polygon" && coords.length >= 3) {
      const pts = coords.map((c) => [c[0], c[1]]);
      geometry = { type: "Polygon", coordinates: [pts] };
    }
    if (!map.getSource("draw")) {
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
      setOkMsg("Fitur baru ditambahkan.");
      setTimeout(() => setOkMsg(""), 2000);
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
      geometry = { type: "Polygon", coordinates: [pts] };
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
      else {
        setOkMsg("Layer ditambahkan ke Web Map.");
        setTimeout(() => setOkMsg(""), 2000);
      }
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
          <div className="h1">{item.title}</div>
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
              <button className="btn secondary" onClick={() => setWmModal("new")}>Add to Web Map</button>
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
          <div className="card" style={{ marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              ["Tipe", `${item.geom_type || "Layer"} · EPSG:4326`],
              ["Fitur", Number(features.length || 0).toLocaleString()],
              ["Field", fields.length],
              ["Dibuat", new Date(item.created_at).toLocaleDateString()],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div>
              </div>
            ))}
          </div>

          <div className="map-wrap" style={{ height: "52vh", position: "relative" }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            <div className="marker-menu" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", maxWidth: "100%" }}>
              <select value={basemap} onChange={(e) => setBasemap(e.target.value)} style={{ width: 150 }}>
                <option value="osm">OpenStreetMap</option>
                <option value="carto_light">Carto Light</option>
                <option value="carto_dark">Carto Dark</option>
                <option value="satellite">Satellite</option>
              </select>
              <button className="btn secondary small" onClick={() => setShowStyle((s) => !s)}>Style</button>
              {!drawMode ? (
                <button className="btn small" onClick={() => { drawVertsRef.current = []; setDrawMode(true); }}>+ Add Feature</button>
              ) : (
                <>
                  <select value={drawType} onChange={(e) => { setDrawType(e.target.value); drawVertsRef.current = []; renderDraw(); }} style={{ width: 100 }}>
                    <option value="Point">Point</option>
                    <option value="LineString">Line</option>
                    <option value="Polygon">Polygon</option>
                  </select>
                  <button className="btn small" onClick={drawType === "Point" ? cancelDraw : finishDraw}>
                    {drawType === "Point" ? "Cancel" : "Finish"}
                  </button>
                </>
              )}
              <button className="btn secondary small" onClick={fitFeatures}>Zoom</button>
            </div>
            {showStyle && (
              <div className="card" style={{ position: "absolute", right: 8, top: 48, width: 250, zIndex: 3, fontSize: 13 }}>
                <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>Symbology</div>
                <label>Warna</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 30, padding: 1 }} />
                  {PALETTE.map((p) => <button key={p} onClick={() => setColor(p)} style={{ width: 16, height: 16, borderRadius: 3, background: p, border: p === color ? "2px solid #fff" : "none", cursor: "pointer" }} />)}
                </div>
                <label>Label — field</label>
                <select value={labelField} onChange={(e) => setLabelField(e.target.value)}>
                  <option value="">— tanpa label —</option>
                  {fields.map((f) => <option key={f.name} value={f.name}>{f.label || f.name}</option>)}
                </select>
                <label>Filter</label>
                <input placeholder="mis. kondisi = 'RUSAK'" value={filterExpr} onChange={(e) => setFilterExpr(e.target.value)} />
              </div>
            )}
            {drawMode && (
              <div className="card" style={{ position: "absolute", left: 8, top: 8, zIndex: 2, fontSize: 13 }}>
                {drawType === "Point" ? "Klik peta untuk menempatkan titik." : `Klik peta untuk menambah vertex (${drawVertsRef.current.length})`}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div className="h1" style={{ fontSize: 16 }}>Data — {dataset?.name}</div>
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
                        <td key={fl.name} onClick={(e) => e.stopPropagation()}>
                          <input
                            style={{ minWidth: 90, padding: "5px 8px", fontSize: 13 }}
                            defaultValue={f.props ? (f.props[fl.name] ?? "") : ""}
                            onBlur={(e) => { if (String(e.target.defaultValue) !== String(e.target.value)) editProp(f, fl.name, e.target.value); }}
                          />
                        </td>
                      ))}
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
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
              {wmModal === "new" ? "Add to New Web Map" : "Add to Existing Web Map"}
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
                <input name="name" defaultValue={`Peta ${item.title}`} required />
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