"use strict";

/* Capas del mapa (MapLibre) — Fase 2: zonas seguras.
   - renderSafePoints: marcadores de los puntos seguros personales del usuario,
     con ícono distinto al de riesgo; al hacer click llaman onClick(punto).
   - renderRiskLayer: dibuja una capa de riesgo a partir de un GeoJSON que se le
     pasa (polígonos y/o puntos). NO contiene datos reales: los alimentas tú. */
var MapLayers = (function () {

  function clearSafePoints(map){
    if(map._spMarkers){ map._spMarkers.forEach(function(m){ try{ m.remove(); }catch(e){} }); }
    map._spMarkers = [];
  }

  function pinEl(category){
    var el = document.createElement("button");
    el.type = "button";
    el.className = "sp-pin " + (category === "evacuacion_huaico" ? "sp-huaico" : "sp-sismo");
    el.setAttribute("aria-label", "Punto seguro");
    // glifo: escudo para antisísmica, flecha para evacuación
    el.innerHTML = (category === "evacuacion_huaico")
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
    return el;
  }

  // points: [{id, lat, lon, category, description, photo_path}]
  function renderSafePoints(map, points, onClick){
    if(!map || !window.maplibregl) return;
    clearSafePoints(map);
    (points || []).forEach(function(p){
      if(typeof p.lat !== "number" || typeof p.lon !== "number") return;
      var el = pinEl(p.category);
      el.addEventListener("click", function(ev){ ev.stopPropagation(); if(onClick) onClick(p); });
      var m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map);
      map._spMarkers.push(m);
    });
  }

  function removeRisk(map){
    ["risk-fill","risk-line","risk-point"].forEach(function(id){ if(map.getLayer(id)) map.removeLayer(id); });
    if(map.getSource("riskzones")) map.removeSource("riskzones");
  }

  // geojson: Feature | FeatureCollection | geometry-array (lo normalizamos)
  function renderRiskLayer(map, geojson){
    if(!map || !window.maplibregl) return;
    if(!map.isStyleLoaded()){ map.once("load", function(){ renderRiskLayer(map, geojson); }); return; }
    removeRisk(map);
    if(!geojson) return;
    var fc = normalize(geojson);
    if(!fc.features.length) return;
    map.addSource("riskzones", { type:"geojson", data: fc });
    var bySeverity = ["match", ["get","severity"], "alto","#D51C39", "medio","#E7A200", "bajo","#0F8A5F", "#8A5BB0"];
    map.addLayer({ id:"risk-fill", type:"fill", source:"riskzones",
      filter:["==",["geometry-type"],"Polygon"],
      paint:{ "fill-color": bySeverity, "fill-opacity":0.22 } });
    map.addLayer({ id:"risk-line", type:"line", source:"riskzones",
      filter:["in",["geometry-type"],["literal",["Polygon","LineString"]]],
      paint:{ "line-color": bySeverity, "line-width":2 } });
    map.addLayer({ id:"risk-point", type:"circle", source:"riskzones",
      filter:["==",["geometry-type"],"Point"],
      paint:{ "circle-color": bySeverity, "circle-radius":7, "circle-stroke-color":"#fff", "circle-stroke-width":2 } });
  }

  function normalize(g){
    if(g && g.type === "FeatureCollection") return g;
    if(g && g.type === "Feature") return { type:"FeatureCollection", features:[g] };
    if(Array.isArray(g)){
      return { type:"FeatureCollection", features: g.map(function(item){
        if(item && item.type === "Feature") return item;
        // {geometry, ...props} o geometría suelta
        var geom = item.geometry || item;
        var props = item.properties || { severity:item.severity, kind:item.kind, name:item.name };
        return { type:"Feature", geometry: geom, properties: props || {} };
      }) };
    }
    if(g && g.type && g.coordinates) return { type:"FeatureCollection", features:[{ type:"Feature", geometry:g, properties:{} }] };
    return { type:"FeatureCollection", features:[] };
  }

  return { renderSafePoints: renderSafePoints, clearSafePoints: clearSafePoints, renderRiskLayer: renderRiskLayer, removeRisk: removeRisk };
})();
