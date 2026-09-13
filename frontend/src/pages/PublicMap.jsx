import maplibregl from "maplibre-gl";
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTheme } from "../theme.jsx";

const BASEMAPS = {
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  carto_light: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  carto_dark: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

const PALETTE = ["#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#a78bfa", "#34d399", "#facc15"];

export default function PublicMap() {
  const { id } = useParams();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const { effective } = useTheme();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/public/maps/${id}/`)
      .then((r) => {
        if (!r.ok) throw new Error("Public map not found or not shared.");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !meta) return;
    const basemapKey = meta.basemap === "satellite" ? "osm" : meta.basemap || "carto_light";
    const style = {
      version: 8,
      sources: {
        basemap: { type: "raster", tiles: [BASEMAPS[basemapKey] || BASEMAPS.carto_light], tileSize: 256 },
      },
      layers: [{ id: "basemap", type: "raster", source: "basemap", minzoom: 0, maxzoom: 19 }],
    };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: (meta.initial_center && meta.initial_center.coordinates) || [110.5, -2.5],
      zoom: meta.initial_zoom || 4,
      attributionControl: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      (meta.layers || []).forEach((ly, i) => {
        const sid = `pub-${ly.id}`;
        map.addSource(sid, {
          type: "geojson",
          data: `/api/v1/public/maps/${meta.id}/layers/${ly.id}/geojson/`,
        });
        const color = PALETTE[i % PALETTE.length];
        if (ly.geom_type === "Point" || ly.geom_type === "MultiPoint") {
          map.addLayer({ id: `${sid}-point`, type: "circle", source: sid, paint: { "circle-color": color, "circle-radius": 5 } });
        } else if (ly.geom_type === "LineString" || ly.geom_type === "MultiLineString") {
          map.addLayer({ id: `${sid}-line`, type: "line", source: sid, paint: { "line-color": color, "line-width": 2.5 } });
        } else {
          map.addLayer({ id: `${sid}-fill`, type: "fill", source: sid, paint: { "fill-color": color, "fill-opacity": 0.3 } });
          map.addLayer({ id: `${sid}-line`, type: "line", source: sid, paint: { "line-color": color, "line-width": 2 } });
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [meta]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div className="mobile-topbar" style={{ display: "flex" }}>
        <span className="brand" style={{ margin: 0 }}>GeoDash</span>
        <a className="muted" href="/login" style={{ marginLeft: "auto", fontSize: 13 }}>Sign in</a>
      </div>
      <div style={{ padding: "14px 18px", background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
        {err ? (
          <div className="err">{err}</div>
        ) : meta ? (
          <>
            <div className="h1">{meta.name}</div>
            <div className="muted">{meta.description}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              Shared publicly by {meta.company} · {meta.layers.length} layer{meta.layers.length === 1 ? "" : "s"}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="spinner" style={{ margin: 0 }} />
            <span className="muted">Loading public map…</span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {meta && (
          <div className="card" style={{ position: "absolute", left: 10, top: 10, zIndex: 2, fontSize: 13, maxWidth: 260 }}>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>Layers</div>
            {meta.layers.map((ly, i) => (
              <div key={ly.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                <span
                  style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], display: "inline-block", flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>{ly.name}</span>
                <span className="muted" style={{ fontSize: 11 }}>{typeof ly.feature_count === "number" ? ly.feature_count.toLocaleString() : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}