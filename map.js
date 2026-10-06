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

  // color por nivel FONDES (5 niveles); si no hay 'nivel', usa 'severity' (cargas manuales)
  var RISK_COLOR = ["match", ["get","nivel"],
    "Muy Alto","#B00020", "Alto","#E8552F", "Medio","#E7A200", "Bajo","#7FB800", "Muy Bajo","#2E9E5B",
    ["match", ["get","severity"], "alto","#D51C39", "medio","#E7A200", "bajo","#0F8A5F", "#8A5BB0"]
  ];

  // geojson: Feature | FeatureCollection | geometry-array (lo normalizamos)
  function renderRiskLayer(map, geojson){
    if(!map || !window.maplibregl) return;
    if(!map.isStyleLoaded()){ map.once("load", function(){ renderRiskLayer(map, geojson); }); return; }
    removeRisk(map);
    if(!geojson) return;
    var fc = normalize(geojson);
    if(!fc.features.length) return;
    map.addSource("riskzones", { type:"geojson", data: fc });
    map.addLayer({ id:"risk-fill", type:"fill", source:"riskzones",
      filter:["==",["geometry-type"],"Polygon"],
      paint:{ "fill-color": RISK_COLOR, "fill-opacity":0.5 } });
    map.addLayer({ id:"risk-line", type:"line", source:"riskzones",
      filter:["in",["geometry-type"],["literal",["Polygon","LineString"]]],
      paint:{ "line-color": RISK_COLOR, "line-width":1 } });
    map.addLayer({ id:"risk-point", type:"circle", source:"riskzones",
      filter:["==",["geometry-type"],"Point"],
      paint:{ "circle-color": RISK_COLOR, "circle-radius":7, "circle-stroke-color":"#fff", "circle-stroke-width":2 } });
    if(!map.__riskClickBound){
      map.on("click", "risk-fill", function(e){
        var p = (e.features && e.features[0] && e.features[0].properties) || {};
        var txt = (p.name || "Zona") + (p.nivel ? (" — Riesgo: " + p.nivel) : "")
          + ((p.prov || p.dep) ? ("\n" + [p.prov, p.dep].filter(Boolean).join(", ")) : "");
        new maplibregl.Popup({ offset:6 }).setLngLat(e.lngLat).setText(txt).addTo(map);
      });
      map.on("mouseenter", "risk-fill", function(){ map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "risk-fill", function(){ map.getCanvas().style.cursor = ""; });
      map.__riskClickBound = true;
    }
  }

  // bounding box de un GeoJSON (para encuadrar el mapa)
  function boundsOf(geojson){
    if(!window.maplibregl) return null;
    var b = null;
    function ext(c){ if(!b){ b = new maplibregl.LngLatBounds(c, c); } else { b.extend(c); } }
    function walk(coords){ if(typeof coords[0] === "number"){ ext(coords); } else { for(var i=0;i<coords.length;i++) walk(coords[i]); } }
    var fc = normalize(geojson);
    fc.features.forEach(function(f){ if(f.geometry && f.geometry.coordinates) walk(f.geometry.coordinates); });
    return b;
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

  // Zonas seguras oficiales (evacuation_points): marcador verde estándar, distinto
  // a los puntos personales (pin cuadrado) y al riesgo (polígonos).
  function clearEvacZones(map){
    if(map._ezMarkers){ map._ezMarkers.forEach(function(m){ try{ m.remove(); }catch(e){} }); }
    map._ezMarkers = [];
  }
  function renderEvacZones(map, zones){
    if(!map || !window.maplibregl) return;
    clearEvacZones(map);
    (zones || []).forEach(function(z){
      if(typeof z.lat !== "number" || typeof z.lon !== "number") return;
      var popup = new maplibregl.Popup({ offset:18 }).setText("Zona segura: " + (z.name || ""));
      var m = new maplibregl.Marker({ color:"#0F8A5F" }).setLngLat([z.lon, z.lat]).setPopup(popup).addTo(map);
      map._ezMarkers.push(m);
    });
  }

  return {
    renderSafePoints: renderSafePoints, clearSafePoints: clearSafePoints,
    renderRiskLayer: renderRiskLayer, removeRisk: removeRisk, boundsOf: boundsOf,
    renderEvacZones: renderEvacZones, clearEvacZones: clearEvacZones
  };
})();
