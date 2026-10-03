"use strict";

/* Fase 2 — datos sísmicos reales desde USGS (API pública, gratis, sin API key, con CORS).
   Documentación: https://earthquake.usgs.gov/fdsnws/event/1/
   Nota: USGS reporta sismos ya ocurridos (latencia de minutos); NO es alerta temprana.
   La alerta temprana oficial en Perú es el SASPe del IGP (integración pendiente, fase posterior). */
var Seismic = (function () {
  var LIMA = { lat: -12.046, lon: -77.0428 };
  var CACHE_KEY = "sismos_lima_quakes_v1";
  var ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";

  function toRad(d){ return d * Math.PI / 180; }
  function haversineKm(lat1, lon1, lat2, lon2){
    var R = 6371;
    var dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2)
      + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function timeAgo(ms){
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "hace " + s + " s";
    var m = Math.round(s / 60); if (m < 60) return "hace " + m + " min";
    var h = Math.round(m / 60); if (h < 24) return "hace " + h + " h";
    var d = Math.round(h / 24); return "hace " + d + " d";
  }

  function loadCache(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } }
  function saveCache(d){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {} }

  function normalize(geo){
    var list = (geo.features || []).map(function (f){
      var c = (f.geometry && f.geometry.coordinates) || [0, 0, 0];
      return {
        id: f.id,
        mag: f.properties.mag,
        place: f.properties.place || "",
        time: f.properties.time,
        lon: c[0], lat: c[1], depth: c[2],
        distKm: Math.round(haversineKm(LIMA.lat, LIMA.lon, c[1], c[0]))
      };
    }).filter(function (q){ return typeof q.mag === "number"; });
    list.sort(function (a, b){ return b.time - a.time; });
    return list;
  }

  function fetchRecent(opts){
    opts = opts || {};
    var radius = opts.radiusKm || 500;
    var minMag = (opts.minMag != null) ? opts.minMag : 3;
    var hours = opts.hours || 24;
    var start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    var url = ENDPOINT + "?format=geojson&orderby=time"
      + "&starttime=" + encodeURIComponent(start)
      + "&latitude=" + LIMA.lat + "&longitude=" + LIMA.lon
      + "&maxradiuskm=" + radius + "&minmagnitude=" + minMag;
    return fetch(url, { cache: "no-store" }).then(function (r){
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (geo){
      var data = { fetchedAt: Date.now(), quakes: normalize(geo) };
      saveCache(data);
      return data;
    });
  }

  return {
    LIMA: LIMA,
    fetchRecent: fetchRecent,
    loadCache: loadCache,
    timeAgo: timeAgo,
    haversineKm: haversineKm
  };
})();
