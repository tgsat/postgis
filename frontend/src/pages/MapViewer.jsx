import maplibregl from "maplibre-gl";
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const BASEMAPS = {
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  carto_light: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  carto_dark: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

const PALETTE = ["#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#a78bfa", "#34d399", "#facc15"];

function geometryToSourceData(geojson) {
  if (geojson.type === "FeatureCollection") return geojson;
  return { type: "FeatureCollection", features: geojson.features || [] };
}

export default function MapViewer() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawVertexRef = useRef([]);
  const drawTypeRef = useRef(null);
  const [searchParams] = useSearchParams();

  const [datasets, setDatasets] = useState([]);
  const [enabled, setEnabled] = useState({});
  const [basemap, setBasemap] = useState("carto_light");
  const [selected, setSelected] = useState(null);
  const [props, setProps] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawType, setDrawType] = useState("Point");
  const [targetDataset, setTargetDataset] = useState("");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [spatial, setSpatial] = useState({ bbox: "", near: "", active: false });

  const mapId = searchParams.get("map");

  const geojsonUrl = (dsId) => {
    const p = new URLSearchParams({ dataset: dsId, page_size: 10000 });
    if (spatial.active && spatial.bbox) p.set("bbox", spatial.bbox);
    if (spatial.active && spatial.near) {
      const [lng, lat, r] = spatial.near.split(",").map((s) => s.trim());
      if (lng && lat && r) p.set("near", `${lng},${lat},${r}`);
    }
    return `/api/v1/features/geojson/?${p.toString()}`;
  };

  useEffect(() => {
    const fetchDatasets = mapId
      ? api.get(`/maps/${mapId}/`, {}).then((map) => {
          const list = map.layers || [];
          return list.map((l) => ({
            id: l.dataset,
            name: l.dataset_name,
            geom_type: l.dataset_geom_type,
            feature_count: l.feature_count || 0,
          }));
        })
      : api.get("/datasets/", { page_size: 500 }).then((data) => (Array.isArray(data) ? data : data.results || []));

    fetchDatasets
      .then((list) => {
        setDatasets(list);
        const on = {};
        list.forEach((d) => {
          on[d.id] = true;
        });
        setEnabled(on);
        if (mapId && list.length) setTargetDataset(String(list[0].id));
      })
      .catch((e) => setErr(e.message));
  }, [mapId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: { type: "raster", tiles: [BASEMAPS[basemap]], tileSize: 256 },
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
      setLoaded(true);
      map.addSource("draw-layer", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "draw-fill", type: "fill", source: "draw-layer", paint: { "fill-color": "#22d3ee", "fill-opacity": 0.25 } });
      map.addLayer({ id: "draw-line", type: "line", source: "draw-layer", paint: { "line-color": "#22d3ee", "line-width": 2 } });
      map.addLayer({ id: "draw-point", type: "circle", source: "draw-layer", paint: { "circle-color": "#22d3ee", "circle-radius": 6 } });

      map.on("click", (ev) => {
        if (drawMode) {
          handleCanvasClick(ev);
          return;
        }
        const bbox = [[ev.point.x - 5, ev.point.y - 5], [ev.point.x + 5, ev.point.y + 5]];
        let found = false;
        Object.keys(enabled).forEach((dsId) => {
          if (found) return;
          const layers = map.queryRenderedFeatures(bbox, { layers: [`ds-${dsId}-fill`, `ds-${dsId}-line`, `ds-${dsId}-point`] });
          if (layers.length) {
            found = true;
            setProps(layers[0].properties || {});
          }
        });
        if (!found) {
          setProps(null);
          setSelected(null);
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    try {
      if (map.getStyle().sources.basemap) {
        map.getSource("basemap").setTiles([BASEMAPS[basemap]]);
      }
    } catch (e) {
      /* style not ready */
    }
  }, [basemap, loaded]);

  const loadDataset = (ds) => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const id = `ds-${ds.id}`;
    if (map.getSource(id)) {
      try {
        map.getSource(id).setData(geojsonUrl(ds.id));
      } catch (e) {
        /* nothing */
      }
      return;
    }
    map.addSource(id, {
      type: "geojson",
      data: geojsonUrl(ds.id),
    });
    const color = PALETTE[ds.id % PALETTE.length];
    if (ds.geom_type === "Point" || ds.geom_type === "MultiPoint") {
      map.addLayer({ id: `${id}-point`, type: "circle", source: id, paint: { "circle-color": color, "circle-radius": 5 } });
    } else if (ds.geom_type === "LineString" || ds.geom_type === "MultiLineString") {
      map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": color, "line-width": 2.5 } });
    } else {
      map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": color, "fill-opacity": 0.3 } });
      map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": color, "line-width": 2 } });
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    datasets.forEach((ds) => {
      const id = `ds-${ds.id}`;
      const has = enabled[ds.id];
      const exists = map.getLayer(`${id}-point`) || map.getLayer(`${id}-line`) || map.getLayer(`${id}-fill`);
      if (has && !exists) {
        loadDataset(ds);
      } else if (has && exists) {
        // refresh data when spatial filter changes
        try {
          map.getSource(id).setData(geojsonUrl(ds.id));
        } catch (e) {
          /* ignore */
        }
      } else if (exists && !has) {
        map.removeLayer(`${id}-point`);
        map.removeLayer(`${id}-line`);
        map.removeLayer(`${id}-fill`);
        if (map.getSource(id)) map.removeSource(id);
      }
    });
  }, [enabled, loaded, datasets, spatial]);

  const toggle = (id) => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const applyExtentFilter = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bbox = `${b.getWest().toFixed(6)},${b.getSouth().toFixed(6)},${b.getEast().toFixed(6)},${b.getNorth().toFixed(6)}`;
    setSpatial((s) => ({ ...s, bbox, active: s.near ? s.active : true }));
    if (!spatial.near) setSpatial((s) => ({ ...s, bbox, active: true }));
    setErr("");
  };

  const clearSpatial = () => {
    setSpatial({ bbox: "", near: "", active: false });
    setErr("");
  };

  const handleCanvasClick = (ev) => {
    const map = mapRef.current;
    const lngLat = map.unproject(ev.point);
    const dsId = Number(targetDataset);
    const ds = datasets.find((d) => d.id === dsId);
    const payload = { properties: {}, geometry: null };
    if (drawType === "Point") {
      payload.geometry = { type: "Point", coordinates: [lngLat.lng, lngLat.lat] };
      submitFeature(dsId, payload);
      return;
    }
    drawVertexRef.current.push([lngLat.lng, lngLat.lat]);
    renderDrawGeometry();
  };

  const renderDrawGeometry = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = drawVertexRef.current;
    let geometry = null;
    if (drawType === "LineString" && coords.length === 1) {
      geometry = { type: "Point", coordinates: coords[0] };
    } else if (drawType === "LineString" && coords.length >= 2) {
      geometry = { type: "LineString", coordinates: coords };
    } else if (drawType === "Polygon" && coords.length >= 2) {
      geometry = { type: "Polygon", coordinates: [...coords, coords[0]].map((c) => [c[0], c[1]]) };
    }
    map.getSource("draw-layer").setData({
      type: "FeatureCollection",
      features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [],
    });
  };

  const finishDraw = () => {
    const dsId = Number(targetDataset);
    if (!dsId) {
      setErr("Select a target dataset first.");
      return;
    }
    const coords = drawVertexRef.current;
    let geometry = null;
    if (drawType === "LineString" && coords.length >= 2) {
      geometry = { type: "LineString", coordinates: coords };
    } else if (drawType === "Polygon" && coords.length >= 3) {
      geometry = { type: "Polygon", coordinates: [...coords, coords[0]] };
    }
    if (!geometry) {
      setErr("Not enough vertices to finish the geometry.");
      return;
    }
    submitFeature(dsId, { geometry });
  };

  const submitFeature = async (dsId, payload) => {
    try {
      await api.post(`/features/?dataset=${dsId}`, payload);
      const ds = datasets.find((d) => d.id === dsId);
      const map = mapRef.current;
      if (map && ds) loadDataset(ds);
      drawVertexRef.current = [];
      renderDrawGeometry();
      setDrawMode(false);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="h1">Maps</div>
          <div className="muted">{mapId ? "Viewing layers of a saved map" : "Interactive map viewer powered by MapLibre GL"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select value={basemap} onChange={(e) => setBasemap(e.target.value)} style={{ width: 150 }}>
            <option value="osm">OpenStreetMap</option>
            <option value="carto_light">Carto Light</option>
            <option value="carto_dark">Carto Dark</option>
          </select>
          {!drawMode ? (
            <button
              className="btn secondary"
              disabled={!targetDataset}
              onClick={() => {
                drawVertexRef.current = [];
                setDrawMode(true);
              }}
            >
              + Add Feature
            </button>
          ) : (
            <>
              <select value={drawType} onChange={(e) => { setDrawType(e.target.value); drawVertexRef.current = []; renderDrawGeometry(); }} style={{ width: 120 }}>
                <option value="Point">Point</option>
                <option value="LineString">Line</option>
                <option value="Polygon">Polygon</option>
              </select>
              <select value={targetDataset} onChange={(e) => setTargetDataset(e.target.value)} style={{ width: 170 }}>
                <option value="">Select dataset...</option>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="btn" onClick={finishDraw} disabled={drawType === "Point"}>Finish</button>
              <button className="btn danger" onClick={() => { setDrawMode(false); drawVertexRef.current = []; renderDrawGeometry(); }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: "10px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ minWidth: 180 }}>
          <label>Near (lng, lat, km)</label>
          <input
            placeholder="110.0, -2.0, 50"
            value={spatial.near}
            onChange={(e) => setSpatial({ ...spatial, near: e.target.value })}
            onBlur={() => spatial.near && setSpatial((s) => ({ ...s, active: true }))}
          />
        </div>
        <button className="btn secondary" onClick={applyExtentFilter}>Set bbox to viewport</button>
        <button className="btn secondary" onClick={clearSpatial}>Clear filter</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {spatial.active ? (spatial.bbox ? `Bounding box applied${spatial.near ? " + radius" : ""}` : spatial.near ? "Radius applied" : "No filter") : "No filter"}
        </span>
      </div>

      {err && <div className="err">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "var(--map-cols)" }}>
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="muted" style={{ fontWeight: 700, marginBottom: 8 }}>Layers</div>
          {datasets.length === 0 && <div className="muted">No datasets yet. Create one under Data &amp; Layers.</div>}
          {datasets.map((d, i) => (
            <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
              <input type="checkbox" checked={!!enabled[d.id]} onChange={() => toggle(d.id)} style={{ width: "auto" }} />
              <span className="pill" style={{ background: PALETTE[i % PALETTE.length], width: 10, height: 10, padding: 0, borderRadius: 3 }} />
              <span style={{ fontSize: 13 }}>{d.name}</span>
              <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{d.feature_count}</span>
            </label>
          ))}
        </div>
        <div className="map-wrap" style={{ height: "78vh", position: "relative" }}>
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
          {props && (
            <div className="card" style={{ position: "absolute", left: 8, bottom: 8, width: 280, zIndex: 2, maxHeight: 300, overflow: "auto", fontSize: 12 }}>
              <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>Feature Properties</div>
              {Object.entries(props).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--muted)", minWidth: 90 }}>{k}</span>
                  <span style={{ wordBreak: "break-all" }}>{String(v)}</span>
                </div>
              ))}
              <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setProps(null)}>Close</button>
            </div>
          )}
          {drawMode && (
            <div className="card" style={{ position: "absolute", left: 8, top: 8, zIndex: 2, fontSize: 13 }}>
              Drawing {drawType} — {drawType === "Point" ? "click the map to place" : `click to add vertices (${drawVertexRef.current.length})`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}