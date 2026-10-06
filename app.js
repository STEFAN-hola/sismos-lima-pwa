"use strict";

/* ---------------- state + persistence ---------------- */
var KEY = "sismos_lima_mvp_v1";
var defaults = {
  screen:"home",
  distrito:"San Isidro",
  alertActive:false,
  hasMobileData:false,
  vulnChecks:[false,false,false,false],
  kitChecks:[false,false,false,false,false],
  reminderOn:true,
  bienSent:false,
  sentStatus:["pendiente","pendiente","pendiente"],
  directoryTab:"emerg",
  lastAlertedId:null
};
var state = load();

function load(){
  try{
    var raw = localStorage.getItem(KEY);
    if(!raw) return Object.assign({}, defaults);
    var s = JSON.parse(raw);
    return Object.assign({}, defaults, s);
  }catch(e){ return Object.assign({}, defaults); }
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
}
function set(patch){ Object.assign(state, patch); save(); render(); }

/* ---------------- seismic (Fase 2: datos reales USGS) ---------------- */
var seismic = { status:"loading", fetchedAt:0, online:(navigator.onLine!==false), quakes:[], last:null };
var ALERT_RULE = { minMag:5.0, radiusKm:300, windowMin:15 };
var seismicStarted = false;

function hydrateSeismicFromCache(){
  var c = Seismic.loadCache();
  if(c && c.quakes){
    seismic.quakes = c.quakes;
    seismic.last = c.quakes[0] || null;
    seismic.fetchedAt = c.fetchedAt || 0;
    seismic.status = "cache";
  }
}

function refreshSeismic(){
  if(navigator.onLine===false){
    seismic.online = false;
    seismic.status = seismic.fetchedAt ? "cache" : "offline";
    rerenderIfHome();
    return;
  }
  seismic.online = true;
  if(!seismic.fetchedAt) seismic.status = "loading";
  Seismic.fetchRecent().then(function(data){
    seismic.quakes = data.quakes;
    seismic.last = data.quakes[0] || null;
    seismic.fetchedAt = data.fetchedAt;
    seismic.status = "ok";
    autoAlertCheck();
    rerenderIfHome();
  }).catch(function(){
    seismic.online = false;
    seismic.status = seismic.fetchedAt ? "cache" : "error";
    rerenderIfHome();
  });
}

function autoAlertCheck(){
  if(state.alertActive) return;
  var now = Date.now();
  for(var i=0;i<seismic.quakes.length;i++){
    var q = seismic.quakes[i];
    if(q.mag >= ALERT_RULE.minMag
       && q.distKm <= ALERT_RULE.radiusKm
       && (now - q.time) <= ALERT_RULE.windowMin*60*1000
       && q.id !== state.lastAlertedId){
      triggerAlert(q);
      return;
    }
  }
}

function rerenderIfHome(){ if(state.screen==="home") render(); }

function refreshAll(){ refreshSeismic(); refreshIgp(); refreshNino(); refreshBackend(); }
function startSeismic(){
  if(seismicStarted) return; seismicStarted = true;
  refreshAll();
  setInterval(refreshAll, 60000);
  window.addEventListener("online", function(){ seismic.online=true; nino.online=true; refreshAll(); });
  window.addEventListener("offline", function(){
    seismic.online=false; seismic.status = seismic.fetchedAt?"cache":"offline";
    nino.online=false; nino.status = nino.data?"cache":"offline";
    rerenderIfHome();
  });
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) refreshAll(); });
}

/* ---- IGP (sismos del Perú) — fuente primaria vía proxy en CI; USGS de respaldo ---- */
var IGP_URL = "./data/igp-sismos.json";
var IGP_CACHE = "sismos_lima_igp_v1";
var igp = { status:"loading", fetchedAt:0, online:(navigator.onLine!==false), data:null };
function igpLoadCache(){ try{ var c=JSON.parse(localStorage.getItem(IGP_CACHE)); if(c && c.data){ igp.data=c.data; igp.fetchedAt=c.savedAt||0; igp.status="cache"; } }catch(e){} }
function refreshIgp(){
  if(navigator.onLine===false){ igp.online=false; igp.status=igp.data?"cache":"offline"; rerenderIfHome(); return; }
  igp.online=true;
  fetch(IGP_URL, {cache:"no-store"}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(d){ igp.data=d; igp.fetchedAt=Date.now(); igp.status="ok";
      try{ localStorage.setItem(IGP_CACHE, JSON.stringify({savedAt:Date.now(), data:d})); }catch(e){}
      rerenderIfHome(); })
    .catch(function(){ igp.online=false; igp.status=igp.data?"cache":"error"; rerenderIfHome(); });
}
function latestQuake(){
  if(igp.data && igp.data.sismos && igp.data.sismos.length){
    var q=igp.data.sismos[0];
    return { src:"IGP", mag:q.magNum, place:q.place, time:q.time, distKm:q.distKm, depth:q.depth, fetchedAt:igp.fetchedAt, online:igp.online };
  }
  if(seismic.last){
    var u=seismic.last;
    return { src:"USGS", mag:u.mag, place:u.place, time:u.time, distKm:u.distKm, depth:u.depth, fetchedAt:seismic.fetchedAt, online:seismic.online };
  }
  return null;
}
function seismicCard(){
  var head = '<div class="eyebrow" style="padding:18px 24px 10px">Actividad sísmica reciente</div>';
  var lq = latestQuake();
  var body, upd = "";
  if(!lq){
    var loading = (igp.status==="loading" && !igp.data);
    if(loading){ body = '<div class="seis-card"><div class="seis-main">Buscando sismos recientes…</div></div>'; }
    else {
      var off = (!igp.online && !seismic.online);
      body = '<div class="seis-card"><div class="seis-main">'+(off?"Sin conexión. Se actualizará con internet.":"Sin sismos recientes registrados.")+'</div></div>';
    }
  } else {
    var mag = Number(lq.mag).toFixed(1);
    var sev = lq.mag>=5 ? "hi" : (lq.mag>=4 ? "mid" : "lo");
    var place = lq.place ? esc(lq.place) : ("a "+lq.distKm+" km de Lima");
    var depth = (typeof lq.depth==="number") ? (Math.round(lq.depth)+" km prof.") : "";
    body = '<div class="seis-card">'
      + '<div class="seis-mag '+sev+'">'+mag+'</div>'
      + '<div class="seis-info"><b>'+place+'</b>'
        + '<small>'+Seismic.timeAgo(lq.time)+' · '+lq.distKm+' km de Lima'+(depth?(' · '+depth):'')+'</small></div>'
      + '</div>';
    upd = '<div class="seis-updated"><span class="dot '+(lq.online?'on':'off')+'"></span>'
      + (lq.online?('Actualizado '+Seismic.timeAgo(lq.fetchedAt)):('Sin conexión · datos de '+Seismic.timeAgo(lq.fetchedAt)))
      + ' · fuente '+lq.src+'</div>';
  }
  return head + '<div style="padding:0 24px">'+body+'</div>' + upd;
}

/* ---------------- data ---------------- */
var VULN = [
  {icon:"anchor", label:"Muebles altos anclados a la pared"},
  {icon:"door", label:"Salida libre de obstáculos"},
  {icon:"flame", label:"Sé dónde cerrar el gas"},
  {icon:"crack", label:"Paredes sin grietas grandes"}
];
var KIT = [
  {icon:"droplet", label:"Agua", hint:"4 litros por persona · cambiar cada 6 meses"},
  {icon:"flashlight", label:"Linterna y pilas", hint:"Revisar que prenda"},
  {icon:"firstaid", label:"Botiquín básico", hint:"Vendas, alcohol, gasas"},
  {icon:"radio", label:"Radio a pilas", hint:"Para escuchar avisos"},
  {icon:"file", label:"Copia de documentos", hint:"DNI y seguro en bolsa"}
];
var CONTACTS = [
  {name:"María Silva", phone:"999 888 777", initials:"MS"},
  {name:"Carlos Rojas", phone:"988 777 666", initials:"CR"},
  {name:"Ana Torres", phone:"977 666 555", initials:"AT"}
];
var EMERG = [
  {name:"Bomberos", meta:"116 · gratis", tel:"116", critical:true},
  {name:"SAMU", meta:"106", tel:"106"},
  {name:"Serenazgo San Isidro", meta:"(01) 513 9000", tel:"015139000"},
  {name:"Cruz Roja Peruana", meta:"(01) 266 0481", tel:"012660481"}
];
var ALB = [
  {name:"Parque El Olivar", meta:"340 m · a 4 min caminando"},
  {name:"Estadio Niño Héroe", meta:"1.2 km"},
  {name:"Colegio San Agustín", meta:"1.8 km"}
];

/* ---------------- icons (stroke svg) ---------------- */
function icon(name, size, sw){
  size = size||24; sw = sw||2.4;
  var p = {
    "shield-check":'<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    "alert":'<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
    "home":'<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    "route":'<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8 18h6a4 4 0 004-4V9"/><path d="M6 15.5V10a4 4 0 014-4h2"/>',
    "briefcase":'<rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M3 13h18"/>',
    "phone":'<path d="M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z"/>',
    "pin":'<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    "wifi":'<path d="M2.5 9a15 15 0 0119 0"/><path d="M5.5 12.5a10 10 0 0113 0"/><path d="M8.5 16a5 5 0 017 0"/><path d="M12 19.5h.01"/>',
    "clock":'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    "arrow":'<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
    "sms":'<path d="M4 5h16v11H9l-4 3v-3H4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
    "chevron":'<path d="M15 5l-7 7 7 7"/>',
    "check":'<path d="M5 12l5 5 9-10"/>',
    "anchor":'<rect x="4" y="4" width="7" height="4" rx="1"/><path d="M4 12h14a2 2 0 012 2v6"/><path d="M18 4v16"/>',
    "door":'<path d="M6 21V4a1 1 0 011-1h7a1 1 0 011 1v17"/><path d="M4 21h14"/><path d="M12 12h.01"/>',
    "flame":'<path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3 .5 2 2 2 2 2-1-3 2-5 2-8z"/>',
    "crack":'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3l-2 6 3 2-2 4 2 3"/>',
    "droplet":'<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
    "flashlight":'<path d="M8 3h8l-1 5-2 2v9h-2v-9l-2-2-1-5z"/><path d="M9.5 6.5h5"/>',
    "firstaid":'<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M12 10v6M9 13h6"/><path d="M9 6V4h6v2"/>',
    "radio":'<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9l11-4"/><circle cx="8" cy="14.5" r="2.2"/><path d="M14 13h4M14 16h4"/>',
    "file":'<path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4"/><path d="M10 13h5M10 16h5"/>',
    "send":'<path d="M4 12l16-8-6 16-3-6-7-2z"/>'
  }[name] || "";
  return '<svg class="ic" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
}

/* ---------------- helpers ---------------- */
function el(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function prepPct(){
  var total = state.vulnChecks.length + state.kitChecks.length;
  var done = state.vulnChecks.filter(Boolean).length + state.kitChecks.filter(Boolean).length;
  return Math.round(done/total*100);
}
function statusBar(onRed){
  return '<div class="statusbar'+(onRed?' on-red':'')+'">'
    + '<span>9:41</span>'
    + '<span class="sb-right"><span class="sb-bars"><i></i><i></i><i></i><i></i></span>'
    + icon("wifi",16,2)
    + '<span class="sb-batt"><span></span></span></span></div>';
}

/* ---------------- El Niño / avisos de lluvia SENAMHI (Fase 2, WFS -> JSON) ---------------- */
var NINO_URL = "./data/senamhi-avisos.json";
var NINO_CACHE = "sismos_lima_nino_v1";
var nino = { status:"loading", fetchedAt:0, online:(navigator.onLine!==false), data:null };

function ninoLoadCache(){
  try{ var c = JSON.parse(localStorage.getItem(NINO_CACHE)); if(c && c.data){ nino.data=c.data; nino.fetchedAt=c.savedAt||0; nino.status="cache"; } }catch(e){}
}
function refreshNino(){
  if(navigator.onLine===false){ nino.online=false; nino.status = nino.data?"cache":"offline"; rerenderIfHome(); return; }
  nino.online = true;
  fetch(NINO_URL, {cache:"no-store"}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(d){
      nino.data=d; nino.fetchedAt=Date.now(); nino.status="ok";
      try{ localStorage.setItem(NINO_CACHE, JSON.stringify({savedAt:Date.now(), data:d})); }catch(e){}
      rerenderIfHome();
    })
    .catch(function(){ nino.online=false; nino.status = nino.data?"cache":"error"; rerenderIfHome(); });
}
function ninoSeverity(num){ return num>=3 ? "hi" : (num>=2 ? "mid" : "lo"); }
function ninoMax(){
  if(!nino.data || !nino.data.avisos) return null;
  var lim = nino.data.avisos.filter(function(a){ return a.afectaLima; });
  if(!lim.length) return null;
  return lim.reduce(function(m,a){ return (!m || a.nivelNum>m.nivelNum) ? a : m; }, null);
}
function ninoCard(){
  var head = '<div class="eyebrow" style="padding:18px 24px 10px">Avisos de lluvia · El Niño (SENAMHI)</div>';
  var body;
  if(nino.status==="loading" && !nino.data){
    body = '<div class="seis-card"><div class="seis-main">Consultando avisos de SENAMHI…</div></div>';
  } else if(!nino.data){
    var msg = (!nino.online || nino.status==="error" || nino.status==="offline")
      ? "Sin conexión. Se actualizará con internet." : "Avisos no disponibles por ahora.";
    body = '<div class="seis-card"><div class="seis-main">'+msg+'</div></div>';
  } else {
    var mx = ninoMax();
    if(mx){
      var sev = ninoSeverity(mx.nivelNum);
      body = '<button class="seis-card seis-tap" data-nav="nino">'
        + '<div class="seis-mag '+sev+'">N'+mx.nivelNum+'</div>'
        + '<div class="seis-info"><b>Aviso de lluvias en tu zona</b>'
          + '<small>'+esc(mx.nivel)+' · '+esc(mx.fecha)+' · toca para ver qué hacer</small></div>'
        + '</button>';
    } else {
      body = '<button class="seis-card seis-tap" data-nav="nino">'
        + '<div class="seis-mag lo">OK</div>'
        + '<div class="seis-info"><b>Sin avisos de lluvia para Lima</b>'
          + '<small>'+(nino.data.total||0)+' activos en el país · toca para ver</small></div>'
        + '</button>';
    }
  }
  var upd = nino.data
    ? '<div class="seis-updated"><span class="dot '+(nino.online?'on':'off')+'"></span>'
      + (nino.online?('Actualizado '+Seismic.timeAgo(nino.fetchedAt)):('Sin conexión · datos de '+Seismic.timeAgo(nino.fetchedAt)))
      + ' · fuente SENAMHI</div>'
    : '';
  return head + '<div style="padding:0 24px">'+body+'</div>' + upd;
}

/* ---------------- backend: contenido Supabase + auth admin (Fase 2) ---------------- */
var CONTENT_CACHE = "sismos_lima_content_v1";
var backend = { shelters:[], contacts:[], evac:[], source:"default", fetchedAt:0, online:(navigator.onLine!==false), profile:null, authed:false };
var login = { step:"email", email:"", msg:"", busy:false };
var adminMsg = "";

function backendHydrate(){
  try{ var c=JSON.parse(localStorage.getItem(CONTENT_CACHE)); if(c && c.shelters){ backend.shelters=c.shelters; backend.contacts=c.contacts; backend.evac=c.evac||[]; backend.fetchedAt=c.savedAt||0; backend.source="cache"; } }catch(e){}
  backend.authed = !!(window.Backend && Backend.getSession());
}
function refreshBackend(){
  if(!(window.Backend && Backend.configured())) return;
  if(navigator.onLine===false){ backend.online=false; return; }
  backend.online=true;
  Backend.fetchContent(state.distrito).then(function(d){
    backend.shelters=d.shelters; backend.contacts=d.contacts; backend.evac=d.evac||[]; backend.source="backend"; backend.fetchedAt=Date.now();
    try{ localStorage.setItem(CONTENT_CACHE, JSON.stringify({savedAt:Date.now(), shelters:d.shelters, contacts:d.contacts, evac:d.evac||[]})); }catch(e){}
    if(state.screen==="dir") render();
  }).catch(function(){ /* conserva cache/default */ });
  if(Backend.getSession()){
    Backend.myProfile().then(function(p){ backend.profile=p; backend.authed=true; if(state.screen==="admin") render(); });
  }
}
function dirEmerg(){ return (backend.contacts && backend.contacts.length) ? backend.contacts : EMERG; }
function dirAlb(){ return (backend.shelters && backend.shelters.length) ? backend.shelters : ALB; }

/* ---------------- zonas seguras: puntos personales + capa de riesgo ---------------- */
var safePoints = [];
var layersOn = { mine:true, risk:true };
var riskGeoJSON = null;   // alimentado por la BD (risk_zones) o window.cargarRiesgo()
var reg = { category:"antisismica", description:"", photoFile:null, photoDataUrl:"", busy:false, msg:"" };

function applyMapLayers(){
  if(!routeMap || !window.MapLayers) return;
  MapLayers.renderSafePoints(routeMap, layersOn.mine ? safePoints : [], onSafePointClick);
  MapLayers.renderRiskLayer(routeMap, layersOn.risk ? riskGeoJSON : null);
}
function loadSafePoints(){
  if(!(window.Backend && Backend.getSession())){ safePoints=[]; applyMapLayers(); return Promise.resolve(); }
  return Backend.listSafePoints().then(function(a){ safePoints=a||[]; applyMapLayers(); }).catch(function(){});
}
function loadRisk(){
  if(!(window.Backend && Backend.configured())) return;
  Backend.fetchRiskZones().then(function(gj){ if(gj && gj.features && gj.features.length){ riskGeoJSON=gj; applyMapLayers(); } }).catch(function(){});
}
window.cargarRiesgo = function(gj){ riskGeoJSON = gj; applyMapLayers(); };

function onSafePointClick(p){
  if(!routeMap || !window.maplibregl) return;
  var cat = (p.category==="evacuacion_huaico") ? "Evacuación (huaico)" : "Zona antisísmica";
  var html = '<div class="sp-popup"><div class="sp-cat">'+cat+'</div>'
    + (p.description ? ('<div class="sp-desc">'+esc(p.description)+'</div>') : '')
    + (p.photo_path ? ('<div class="sp-photo" id="sp-photo-'+esc(p.id)+'">Cargando foto…</div>') : '')
    + '</div>';
  new maplibregl.Popup({ offset:24, maxWidth:"240px" }).setLngLat([p.lon,p.lat]).setHTML(html).addTo(routeMap);
  if(p.photo_path){
    Backend.signedPhotoUrl(p.photo_path).then(function(url){
      var c=document.getElementById("sp-photo-"+p.id); if(c){ c.innerHTML = url ? ('<img src="'+url+'" alt="foto del punto seguro">') : '(sin foto)'; }
    }).catch(function(){ var c=document.getElementById("sp-photo-"+p.id); if(c) c.textContent="(foto no disponible)"; });
  }
}
function openRegister(){
  if(!(window.Backend && Backend.getSession())){ login.returnTo="regpunto"; set({screen:"login"}); return; }
  reg = { category:"antisismica", description:"", photoFile:null, photoDataUrl:"", busy:false, msg:"" };
  set({screen:"regpunto"});
}
function saveRegPoint(){
  if(reg.busy) return;
  var de = document.getElementById("rpDesc"); if(de) reg.description = de.value;
  function doSave(pos){
    reg.busy=true; reg.msg=""; render();
    var uid = Backend.myUserId();
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (""+Date.now()+Math.random().toString(16).slice(2));
    var path = uid + "/" + id + ".jpg";
    var up = reg.photoFile ? Backend.uploadSafePhoto(path, reg.photoFile) : Promise.resolve(null);
    up.then(function(){
      return Backend.insertSafePoint({ id:id, category:reg.category, description:reg.description, lat:pos.lat, lon:pos.lon, photo_path: reg.photoFile?path:null });
    }).then(function(){ reg.busy=false; return loadSafePoints(); })
      .then(function(){ set({screen:"ruta"}); })
      .catch(function(e){ reg.busy=false; reg.msg="No se pudo guardar: "+(e.message||"error"); render(); });
  }
  if(userPos){ doSave(userPos); }
  else if(navigator.geolocation){
    reg.busy=true; reg.msg="Obteniendo ubicación…"; render();
    navigator.geolocation.getCurrentPosition(
      function(p){ reg.busy=false; doSave({lat:p.coords.latitude, lon:p.coords.longitude}); },
      function(){ reg.busy=false; reg.msg="No se pudo obtener tu ubicación. Activa el GPS."; render(); },
      { enableHighAccuracy:true, timeout:15000 });
  } else { reg.msg="Tu dispositivo no tiene GPS."; render(); }
}

/* ---------------- screens ---------------- */
function screenHome(){
  var alert = state.alertActive;
  var pct = prepPct();
  var s = el('<div class="screen"></div>');
  s.innerHTML = statusBar(false)
  + '<div class="scroll">'
    + '<div class="home-head">'
      + '<div><div class="dist-label">Tu distrito</div><div class="dist">'+esc(state.distrito)+'</div></div>'
      + '<div class="chip-off"><span class="dot"></span><span>Sin datos: OK</span></div>'
    + '</div>'
    + '<div class="status-card'+(alert?' alert':'')+'">'
      + '<div class="sc-circle">'+icon(alert?"alert":"shield-check",30,2.4)+'</div>'
      + '<h2>'+(alert?"Alerta activa":"Todo normal")+'</h2>'
      + '<div class="sc-sub">'+(alert?"Sigue las instrucciones de la app":"No hay sismos reportados ahora")+'</div>'
      + '<div class="sc-sep"></div>'
      + '<div class="sc-prep"><span>Preparación</span><span>'+pct+'%</span></div>'
      + '<div class="prep-track"><div class="prep-fill" style="width:'+pct+'%"></div></div>'
    + '</div>'
    + seismicCard()
    + ninoCard()
    + '<div class="eyebrow" style="padding:20px 24px 12px">Qué quieres hacer</div>'
    + '<div class="grid2">'
      + tile("casa","blue","home","Revisar<br>mi casa")
      + tile("ruta","blue","route","Ruta de<br>evacuación")
      + tile("kit","green","briefcase","Mi kit de<br>emergencia")
      + tile("dir","green","phone","Contactos<br>y albergues")
    + '</div>'
    + '<div class="offline-note">'+icon("wifi",22,2.2)+'<span>Todo funciona sin internet. Los mapas ya están en tu teléfono.</span></div>'
    + '<div class="demo-tag">— Demo · no va en producción —</div>'
    + '<button class="btn-demo" id="simular">'+icon("alert",22,2.4)+'Simular sismo</button>'
    + '<div class="demo-bar">'
      + '<div class="demo-row"><label>Tengo datos móviles</label><button class="switch'+(state.hasMobileData?' on':'')+'" id="toggleData" aria-label="datos móviles"><span class="knob"></span></button></div>'
      + '<button class="demo-reset" id="reset">Reiniciar todo el progreso</button>'
    + '</div>'
    + '<button class="admin-link" id="adminLink">Acceso administrador</button>'
  + '</div>';

  s.querySelectorAll("[data-nav]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:b.getAttribute("data-nav")}); }); });
  s.querySelector("#simular").addEventListener("click",function(){ triggerAlert(); });
  s.querySelector("#toggleData").addEventListener("click",function(){ set({hasMobileData:!state.hasMobileData}); });
  s.querySelector("#reset").addEventListener("click",function(){ state=Object.assign({},defaults); save(); render(); });
  s.querySelector("#adminLink").addEventListener("click",function(){ if(window.Backend && Backend.getSession()){ set({screen:"admin"}); } else { login.returnTo="admin"; set({screen:"login"}); } });
  return s;
}
function tile(nav,color,ic,label){
  return '<button class="tile '+color+'" data-nav="'+nav+'">'+icon(ic,32,2.3)+'<span class="t-label">'+label+'</span></button>';
}

function screenCasa(){
  var done = state.vulnChecks.filter(Boolean).length;
  var pct = Math.round(done/VULN.length*100);
  var s = el('<div class="screen"></div>');
  var rows = VULN.map(function(v,i){
    var on = state.vulnChecks[i];
    return '<button class="check-row'+(on?' on':'')+'" data-i="'+i+'">'
      + '<span class="ci">'+icon(v.icon,30,2.4)+'</span>'
      + '<span class="cl">'+esc(v.label)+'</span>'
      + '<span class="mark">'+icon("check",20,3)+'</span></button>';
  }).join("");
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Revisar mi casa</h1></div>'
  + '<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>'
    + '<div class="progress-label">'+done+' de '+VULN.length+' revisados</div></div>'
  + '<div class="scroll"><div class="list">'+rows+'</div></div>'
  + '<div class="footer-bar"><button class="btn-primary" data-back>Guardar y volver</button>'
    + '<div class="foot-note">Puedes continuar después. Se guarda solo.</div></div>';
  s.querySelectorAll("[data-i]").forEach(function(r){ r.addEventListener("click",function(){
    var i=+r.getAttribute("data-i"); var v=state.vulnChecks.slice(); v[i]=!v[i]; set({vulnChecks:v});
  });});
  bindBack(s);
  return s;
}

function screenKit(){
  var done = state.kitChecks.filter(Boolean).length;
  var left = KIT.length-done;
  var title = left===0?"Tu kit está completo":(left===1?"Te falta 1 cosa":"Te faltan "+left+" cosas");
  var s = el('<div class="screen"></div>');
  var rows = KIT.map(function(k,i){
    var on = state.kitChecks[i];
    return '<button class="kit-row'+(on?' on':'')+'" data-i="'+i+'">'
      + '<span class="box">'+icon("check",22,3.2)+'</span>'
      + '<span class="kt"><b>'+esc(k.label)+'</b><small>'+esc(k.hint)+'</small></span>'
      + '<span class="kic">'+icon(k.icon,24,2.3)+'</span></button>';
  }).join("");
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back green" data-back>'+icon("chevron",22,2.6)+'</button><h1>Mi kit de emergencia</h1></div>'
  + '<div class="kit-card"><div class="kc-circle">'+done+'/'+KIT.length+'</div>'
    + '<div><h2>'+title+'</h2><div class="kc-sub">Manténlo listo y a la mano</div></div></div>'
  + '<div class="scroll"><div class="list" style="padding-top:12px">'+rows+'</div></div>'
  + '<div class="footer-bar"><div class="reminder">'+icon("clock",22,2.4)
    + '<p>Te recordamos revisar el agua cada 6 meses</p>'
    + '<button class="switch'+(state.reminderOn?' on':'')+'" id="rem" aria-label="recordatorio"><span class="knob"></span></button></div></div>';
  s.querySelectorAll("[data-i]").forEach(function(r){ r.addEventListener("click",function(){
    var i=+r.getAttribute("data-i"); var v=state.kitChecks.slice(); v[i]=!v[i]; set({kitChecks:v});
  });});
  s.querySelector("#rem").addEventListener("click",function(){ set({reminderOn:!state.reminderOn}); });
  bindBack(s);
  return s;
}

/* ---- mapa real (MapLibre) + rastreo GPS de la zona segura más cercana ---- */
var MAPLIBRE_JS = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js";
var MAPLIBRE_CSS = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css";
var MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
var routeMap = null, routeUserMarker = null, routeDestMarker = null, routeCurrentZone = null;
var userPos = null, geoWatchId = null;
var _mlPromise = null;

/* Zonas de EJEMPLO para San Isidro — reemplazar por coordenadas verificadas del
   distrito (el admin las carga en evacuation_points). Solo se usan si la BD no
   tiene zonas con coordenadas. */
var EVAC_FALLBACK = [
  { name:"Parque El Olivar", lat:-12.0975, lon:-77.0364, instructions:"Zona abierta amplia; aléjate de fachadas y postes." },
  { name:"Parque Roosevelt", lat:-12.0922, lon:-77.0410, instructions:"Ve al centro del parque, lejos de árboles grandes." },
  { name:"Parque Mariscal Castilla", lat:-12.1007, lon:-77.0306, instructions:"Espacio abierto; mantente lejos de muros." },
  { name:"Estadio Niño Héroe M. Bonilla", lat:-12.1039, lon:-77.0335, instructions:"Ingresa a la cancha, lejos de graderías." }
];
function safeZones(){
  var out = [];
  (backend.evac||[]).forEach(function(e){ if(typeof e.lat==="number" && typeof e.lon==="number") out.push({name:e.name,lat:e.lat,lon:e.lon,instructions:e.instructions}); });
  (backend.shelters||[]).forEach(function(s){ if(typeof s.lat==="number" && typeof s.lon==="number") out.push({name:s.name,lat:s.lat,lon:s.lon,instructions:"Albergue"+(s.meta?(" · "+s.meta):"")}); });
  return out.length ? out : EVAC_FALLBACK;
}
function usingExampleZones(){
  var n = (backend.evac||[]).filter(function(e){return typeof e.lat==="number";}).length
        + (backend.shelters||[]).filter(function(s){return typeof s.lat==="number";}).length;
  return n===0;
}
function nearestZone(pos){
  var zs = safeZones(), best=null, bestM=Infinity;
  for(var i=0;i<zs.length;i++){ var z=zs[i]; var m=Seismic.haversineKm(pos.lat,pos.lon,z.lat,z.lon)*1000; if(m<bestM){ bestM=m; best=z; } }
  return { zone: best||zs[0], meters: bestM };
}
function fmtDist(m){ return m<1000 ? (Math.round(m)+" m") : ((m/1000).toFixed(1)+" km"); }

function ensureMapLibre(){
  if(window.maplibregl) return Promise.resolve();
  if(_mlPromise) return _mlPromise;
  _mlPromise = new Promise(function(res, rej){
    var css = document.createElement("link"); css.rel="stylesheet"; css.href=MAPLIBRE_CSS; document.head.appendChild(css);
    var sc = document.createElement("script"); sc.src=MAPLIBRE_JS;
    sc.onload=function(){ res(); }; sc.onerror=function(){ _mlPromise=null; rej(new Error("maplibre load failed")); };
    document.head.appendChild(sc);
  });
  return _mlPromise;
}
function destroyRouteMap(){ if(routeMap){ try{ routeMap.remove(); }catch(e){} } routeMap=null; routeUserMarker=null; routeDestMarker=null; }

function initRouteMap(zone){
  if(navigator.onLine===false) return;             // offline -> queda el esquemático
  var container = document.getElementById("routemap");
  if(!container || !zone) return;
  var origin = userPos || { lat:zone.lat, lon:zone.lon };
  ensureMapLibre().then(function(){
    destroyRouteMap();
    container.hidden = false;
    var map = new maplibregl.Map({ container: container, style: MAP_STYLE, center: [zone.lon, zone.lat], zoom: 15 });
    routeMap = map; routeCurrentZone = zone;
    map.on("load", function(){
      map.addSource("route", {type:"geojson", data:{type:"Feature", geometry:{type:"LineString", coordinates:[[origin.lon,origin.lat],[zone.lon,zone.lat]]}}});
      map.addLayer({id:"route-halo", type:"line", source:"route", paint:{"line-color":"#0E4C7E","line-width":12,"line-opacity":0.22,"line-blur":1}});
      map.addLayer({id:"route-line", type:"line", source:"route", layout:{"line-cap":"round","line-join":"round"}, paint:{"line-color":"#0E4C7E","line-width":5}});
      routeUserMarker = new maplibregl.Marker({color:"#0E4C7E"}).setLngLat([origin.lon,origin.lat]).setPopup(new maplibregl.Popup({offset:18}).setText("Tu ubicación")).addTo(map);
      routeDestMarker = new maplibregl.Marker({color:"#0F8A5F"}).setLngLat([zone.lon,zone.lat]).setPopup(new maplibregl.Popup({offset:18}).setText(zone.name)).addTo(map);
      var b = new maplibregl.LngLatBounds([origin.lon,origin.lat],[origin.lon,origin.lat]); b.extend([zone.lon,zone.lat]);
      map.fitBounds(b, {padding:60, maxZoom:16});
      var chip = document.querySelector(".map-chip"); if(chip){ chip.innerHTML = '<span class="dot"></span>Mapa en vivo'; }
      if(userPos) updateMapLive(userPos, routeCurrentZone, false);
      applyMapLayers(); loadSafePoints(); loadRisk();
    });
  }).catch(function(){ /* sin red/lib: queda el esquemático */ });
}
function updateMapLive(pos, zone, zoneChanged){
  if(!(routeMap && routeMap.loaded && routeMap.loaded())) return;
  if(routeUserMarker) routeUserMarker.setLngLat([pos.lon,pos.lat]);
  if(zoneChanged && routeDestMarker && zone){ routeDestMarker.setLngLat([zone.lon,zone.lat]).setPopup(new maplibregl.Popup({offset:18}).setText(zone.name)); }
  var src = routeMap.getSource("route"); if(src && zone){ src.setData({type:"Feature", geometry:{type:"LineString", coordinates:[[pos.lon,pos.lat],[zone.lon,zone.lat]]}}); }
}

function setTrack(msg){ var t=document.getElementById("rz-track"); if(t){ var sp=t.querySelector("span"); if(sp) sp.textContent=msg; } }
function fillSheet(pos, zone){
  var nameEl=document.getElementById("rz-name"); if(!nameEl) return;
  nameEl.textContent = zone ? zone.name : "—";
  var stepsEl=document.getElementById("rz-steps"), distEl=document.getElementById("rz-dist"), timeEl=document.getElementById("rz-time");
  var instrEl=document.getElementById("rz-instr");
  if(pos && zone){
    var m = Seismic.haversineKm(pos.lat,pos.lon,zone.lat,zone.lon)*1000;
    if(stepsEl) stepsEl.textContent = "≈"+Math.round(m/0.75);
    if(distEl) distEl.textContent = fmtDist(m);
    if(timeEl) timeEl.textContent = Math.max(1,Math.round((m/1000)/5*60))+" min";
    if(instrEl){ var sp=instrEl.querySelector("span"); if(sp) sp.textContent = zone.instructions || "Dirígete a la zona segura."; }
  } else {
    if(stepsEl) stepsEl.textContent = "—";
    if(distEl) distEl.textContent = "—";
    if(timeEl) timeEl.textContent = "—";
  }
}
function onPosition(){
  if(state.screen!=="ruta" || !userPos) return;
  var n = nearestZone(userPos);
  var changed = (n.zone !== routeCurrentZone);
  routeCurrentZone = n.zone;
  fillSheet(userPos, n.zone);
  setTrack("Ubicación activa · se actualiza al caminar · solo en tu teléfono");
  updateMapLive(userPos, n.zone, changed);
}
function startTracking(){
  if(!navigator.geolocation){ setTrack("Tu dispositivo no tiene GPS."); return; }
  stopTracking();
  setTrack("Buscando tu ubicación…");
  geoWatchId = navigator.geolocation.watchPosition(function(p){
    userPos = { lat:p.coords.latitude, lon:p.coords.longitude };
    onPosition();
  }, function(err){
    setTrack(err && err.code===1 ? "Activa el permiso de ubicación para ver la zona a tus pasos." : "No se pudo obtener tu ubicación.");
  }, { enableHighAccuracy:true, maximumAge:10000, timeout:15000 });
}
function stopTracking(){ if(geoWatchId!=null && navigator.geolocation){ try{ navigator.geolocation.clearWatch(geoWatchId); }catch(e){} geoWatchId=null; } }

function screenRuta(){
  var s = el('<div class="screen"></div>');
  var chipText = (navigator.onLine!==false) ? "Cargando mapa…" : "Mapa guardado · sin internet";
  var initZone = userPos ? nearestZone(userPos).zone : safeZones()[0];
  var exampleNote = usingExampleZones() ? '<div class="zone-example">Ubicaciones de ejemplo — el distrito debe cargar las verificadas.</div>' : '';
  s.innerHTML = statusBar(false)
  + '<div class="scroll" style="display:flex;flex-direction:column">'
    + '<div class="map">'
      + '<div class="ave-h"></div><div class="ave-v"></div><div class="park"></div>'
      + '<svg class="route" viewBox="0 0 390 474" preserveAspectRatio="none">'
        + '<path d="M60 520 L60 300 L172 300 L172 160 L250 160" fill="none" stroke="#0E4C7E" stroke-opacity="0.25" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M60 520 L60 300 L172 300 L172 160 L250 160" fill="none" stroke="#0E4C7E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/>'
      + '</svg>'
      + '<div class="user-dot">'+icon("home",22,2.4)+'</div>'
      + '<div class="dest"><div class="pill">Zona segura</div><div class="pin">'+icon("pin",30,2.4)+'</div></div>'
      + '<div id="routemap" class="routemap" hidden></div>'
      + '<div class="map-overlay"><button class="back" data-back>'+icon("chevron",22,2.6)+'</button>'
        + '<div class="map-chip"><span class="dot"></span>'+chipText+'</div></div>'
    + '</div>'
    + '<div class="sheet">'
      + '<div><div class="eyebrow" style="color:var(--verde-oscuro)">Zona segura más cercana</div>'
        + '<div class="r-name" id="rz-name">'+esc(initZone?initZone.name:"—")+'</div></div>'
      + exampleNote
      + '<div class="stats">'
        + '<div class="stat"><div class="s-l">A unos pasos</div><div class="s-v" id="rz-steps">—</div></div>'
        + '<div class="stat"><div class="s-l">Distancia</div><div class="s-v" id="rz-dist">—</div></div>'
        + '<div class="stat"><div class="s-l">A pie</div><div class="s-v" id="rz-time">—</div></div>'
      + '</div>'
      + '<div class="instr" id="rz-instr">'+icon("arrow",22,2.4)+'<span>'+esc(initZone&&initZone.instructions?initZone.instructions:"Activa la ubicación para ver la zona más cercana a tus pasos.")+'</span></div>'
      + '<div class="track-note" id="rz-track">'+icon("pin",16,2.4)+'<span>Buscando tu ubicación…</span></div>'
      + '<div class="layer-toggles">'
        + '<button class="layer-btn sp'+(layersOn.mine?' on':'')+'" id="tglMine">Mis puntos seguros</button>'
        + '<button class="layer-btn rk'+(layersOn.risk?' on':'')+'" id="tglRisk">Riesgo (huaicos/fallas)</button>'
      + '</div>'
      + '<button class="cta-soft" id="regPoint">＋ Registrar punto seguro aquí</button>'
      + '<button class="cta-tall" data-nav="dir">Ver directorio</button>'
    + '</div>'
  + '</div>';
  s.querySelectorAll("[data-nav]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:b.getAttribute("data-nav")}); }); });
  bindBack(s);
  var tm=s.querySelector("#tglMine"); if(tm) tm.addEventListener("click",function(){ layersOn.mine=!layersOn.mine; tm.classList.toggle("on",layersOn.mine); applyMapLayers(); });
  var tr=s.querySelector("#tglRisk"); if(tr) tr.addEventListener("click",function(){ layersOn.risk=!layersOn.risk; tr.classList.toggle("on",layersOn.risk); applyMapLayers(); });
  var rp=s.querySelector("#regPoint"); if(rp) rp.addEventListener("click",function(){ openRegister(); });
  routeCurrentZone = initZone;
  if(userPos){ fillSheet(userPos, nearestZone(userPos).zone); }
  if(navigator.onLine!==false && initZone){ setTimeout(function(){ initRouteMap(routeCurrentZone); }, 0); }
  setTimeout(startTracking, 0);
  return s;
}

function screenOk(){
  var sent = state.bienSent;
  var s = el('<div class="screen"></div>');
  var contactRows = CONTACTS.map(function(c,i){
    var st = state.sentStatus[i];
    var label = st==="sms"?"SMS ✓":(st==="enviado"?"Enviado ✓":"Pendiente");
    var done = st!=="pendiente";
    return '<div class="contact"><div class="av">'+esc(c.initials)+'</div>'
      + '<div class="cinfo"><b>'+esc(c.name)+'</b><small>'+esc(c.phone)+'</small></div>'
      + '<div class="cstat'+(done?' done':'')+'">'+label+'</div></div>';
  }).join("");
  var smsText = state.hasMobileData
    ? "Con datos: el aviso se envía al instante."
    : "Sin datos móviles: el aviso se envía por SMS gratis.";
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back green" data-back>'+icon("chevron",22,2.6)+'</button><h1>Estoy bien</h1></div>'
  + '<div class="ok-sub">Avisa a tus contactos con un toque, incluso sin datos.</div>'
  + '<div class="scroll">'
    + '<div class="big-btn-wrap"><button class="big-btn'+(sent?' sent':'')+'" id="bien">'
      + icon("check",64,2.6)+'<span class="bb-label">'+(sent?"Enviado":"Estoy bien")+'</span></button></div>'
    + '<div class="sms-note">'+icon("sms",24,2.3)+'<span>'+smsText+'</span></div>'
    + '<div style="height:16px"></div>'+contactRows
    + '<div style="height:16px"></div>'
  + '</div>';
  s.querySelector("#bien").addEventListener("click",function(){
    if(state.bienSent) return;
    var st = CONTACTS.map(function(){ return state.hasMobileData?"enviado":"sms"; });
    set({bienSent:true, sentStatus:st});
    if(navigator.vibrate){ try{navigator.vibrate(30);}catch(e){} }
  });
  bindBack(s);
  return s;
}

function screenDir(){
  var tab = state.directoryTab;
  var s = el('<div class="screen"></div>');
  var rows;
  if(tab==="emerg"){
    rows = dirEmerg().map(function(e){
      return '<div class="dir-row'+(e.critical?' critical':'')+'">'
        + '<div class="di"><b>'+esc(e.name)+'</b><small>'+esc(e.meta)+'</small></div>'
        + '<a class="dir-act" href="tel:'+esc(e.tel)+'" aria-label="Llamar a '+esc(e.name)+'">'+icon("phone",26,2.3)+'</a></div>';
    }).join("");
  }else{
    rows = dirAlb().map(function(a){
      return '<div class="dir-row shelter">'
        + '<div class="di"><b>'+esc(a.name)+'</b><small>'+esc(a.meta)+'</small></div>'
        + '<button class="dir-act" aria-label="Ubicar '+esc(a.name)+'">'+icon("pin",26,2.3)+'</button></div>';
    }).join("");
  }
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Contactos y albergues</h1></div>'
  + '<div class="seg"><button class="'+(tab==="emerg"?"active":"")+'" data-tab="emerg">Emergencias</button>'
    + '<button class="'+(tab==="alb"?"active":"")+'" data-tab="alb">Albergues</button></div>'
  + '<div class="scroll">'+rows
    + '<div class="foot-note" style="margin:8px 24px 20px">'
    + (tab==="emerg"?"Lista descargada. Las llamadas funcionan sin datos.":"Ubicaciones guardadas en tu teléfono.")+'</div></div>';
  s.querySelectorAll("[data-tab]").forEach(function(b){ b.addEventListener("click",function(){ set({directoryTab:b.getAttribute("data-tab")}); }); });
  bindBack(s);
  return s;
}

function ninoItem(a){
  var sev = ninoSeverity(a.nivelNum);
  return '<div class="nino-item sev-'+sev+'">'
    + '<div class="nino-top"><span class="nino-badge '+sev+'">'+esc(a.nivel)+'</span><span class="nino-fecha">'+esc(a.fecha)+'</span></div>'
    + '<p class="nino-desc">'+esc(a.descripcion)+'</p>'
    + '<div class="nino-reco"><b>Qué hacer: </b>'+esc(a.recomendacion)+'</div>'
    + '</div>';
}
function screenNino(){
  var s = el('<div class="screen"></div>');
  var d = nino.data;
  var content;
  if(!d){
    content = '<div class="list"><div class="seis-card"><div class="seis-main">'
      + (nino.online?"Cargando avisos…":"Sin conexión. No hay datos guardados aún.")+'</div></div></div>';
  } else {
    var lim = d.avisos.filter(function(a){ return a.afectaLima; }).sort(function(a,b){ return b.nivelNum-a.nivelNum; });
    var otros = d.avisos.filter(function(a){ return !a.afectaLima; }).length;
    var blocks = lim.length
      ? lim.map(function(a){ return ninoItem(a); }).join("")
      : '<div class="nino-ok">'+icon("shield-check",30,2.4)+'<div><b>Sin avisos de lluvia para Lima</b><small>No hay alertas de lluvia que incluyan tu zona ahora.</small></div></div>';
    var foot = '<div class="foot-note" style="margin:6px 24px 22px">'+otros+' aviso(s) activos en otras zonas del país · fuente SENAMHI · '
      + (nino.online?('actualizado '+Seismic.timeAgo(nino.fetchedAt)):('sin conexión, datos de '+Seismic.timeAgo(nino.fetchedAt)))+'</div>';
    content = '<div class="list">'+blocks+'</div>'+foot;
  }
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Avisos de lluvia</h1></div>'
  + '<div class="ok-sub">El Niño trae lluvias intensas → huaicos y desbordes. Fuente oficial: SENAMHI.</div>'
  + '<div class="scroll">'+content+'</div>';
  bindBack(s);
  return s;
}

function screenRegPunto(){
  var s = el('<div class="screen"></div>');
  if(!(window.Backend && Backend.getSession())){
    setTimeout(function(){ login.returnTo="regpunto"; set({screen:"login"}); }, 0);
    s.innerHTML = statusBar(false)
      + '<div class="head-row"><button class="back blue" id="rpBack">'+icon("chevron",22,2.6)+'</button><h1>Registrar punto</h1></div>'
      + '<div class="scroll"><div class="list"><div class="seis-card"><div class="seis-main">Inicia sesión para registrar tus puntos seguros…</div></div></div></div>';
    s.querySelector("#rpBack").addEventListener("click",function(){ set({screen:"ruta"}); });
    return s;
  }
  function catBtn(val,label){ return '<button class="cat-btn'+(reg.category===val?' on':'')+'" data-cat="'+val+'">'+label+'</button>'; }
  var preview = reg.photoDataUrl ? '<img class="reg-prev" src="'+reg.photoDataUrl+'" alt="foto">' : '<div class="reg-prev empty">Sin foto aún</div>';
  s.innerHTML = statusBar(false)
  + '<div class="head-row"><button class="back blue" id="rpBack">'+icon("chevron",22,2.6)+'</button><h1>Registrar punto seguro</h1></div>'
  + '<div class="scroll"><div class="form">'
    + '<label class="flabel">Categoría</label>'
    + '<div class="cat-row">'+catBtn("antisismica","Zona antisísmica")+catBtn("evacuacion_huaico","Evacuación (huaico)")+'</div>'
    + '<label class="flabel">Foto</label>'
    + preview
    + '<input type="file" accept="image/*" capture="environment" id="rpPhoto" class="finput">'
    + '<label class="flabel">Descripción</label>'
    + '<input class="finput" id="rpDesc" placeholder="Ej. Debajo de la mesa del comedor" value="'+esc(reg.description)+'">'
    + '<button class="btn-primary" id="rpSave"'+(reg.busy?' disabled':'')+'>'+(reg.busy?'Guardando…':'Guardar punto aquí')+'</button>'
    + (reg.msg?'<div class="fmsg">'+esc(reg.msg)+'</div>':'')
    + '<p class="fhint">Se guarda en tu ubicación actual (GPS). Solo tú ves tus puntos; la foto es privada.</p>'
  + '</div></div>';
  s.querySelector("#rpBack").addEventListener("click",function(){ set({screen:"ruta"}); });
  s.querySelectorAll("[data-cat]").forEach(function(b){ b.addEventListener("click",function(){ reg.category=b.getAttribute("data-cat"); render(); }); });
  var ph=s.querySelector("#rpPhoto");
  if(ph) ph.addEventListener("change",function(){ var f=ph.files&&ph.files[0]; if(f){ reg.photoFile=f; var rd=new FileReader(); rd.onload=function(){ reg.photoDataUrl=rd.result; render(); }; rd.readAsDataURL(f); } });
  var de=s.querySelector("#rpDesc"); if(de) de.addEventListener("input",function(){ reg.description=de.value; });
  var sv=s.querySelector("#rpSave"); if(sv) sv.addEventListener("click",saveRegPoint);
  return s;
}

function screenLogin(){
  var s = el('<div class="screen"></div>');
  var body;
  if(!(window.Backend && Backend.configured())){
    body = '<div class="list"><div class="seis-card"><div class="seis-main">Backend no configurado.</div></div></div>';
  } else if(login.step==="email"){
    body = '<div class="form">'
      + '<button class="oauth-btn google" id="oauthGoogle">Continuar con Google</button>'
      + '<button class="oauth-btn facebook" id="oauthFacebook">Continuar con Facebook</button>'
      + '<div class="or-sep">o con tu correo</div>'
      + '<label class="flabel">Correo</label>'
      + '<input class="finput" type="email" id="email" inputmode="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" value="'+esc(login.email)+'">'
      + '<button class="btn-primary" id="sendBtn"'+(login.busy?' disabled':'')+'>'+(login.busy?'Enviando…':'Enviar código')+'</button>'
      + (login.msg?'<div class="fmsg">'+esc(login.msg)+'</div>':'')
      + '<p class="fhint">Te llega un código de 6 dígitos. Google/Facebook requieren estar configurados en Supabase.</p>'
      + '</div>';
  } else {
    body = '<div class="form">'
      + '<label class="flabel">Código enviado a '+esc(login.email)+'</label>'
      + '<input class="finput" type="text" id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="8">'
      + '<button class="btn-primary" id="verifyBtn"'+(login.busy?' disabled':'')+'>'+(login.busy?'Verificando…':'Verificar y entrar')+'</button>'
      + (login.msg?'<div class="fmsg">'+esc(login.msg)+'</div>':'')
      + '<button class="demo-reset" id="backEmail">Cambiar correo</button>'
      + '</div>';
  }
  s.innerHTML = statusBar(false)
    + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Iniciar sesión</h1></div>'
    + '<div class="scroll">'+body+'</div>';
  bindBack(s);
  if(login.step==="email"){
    var og=s.querySelector("#oauthGoogle"); if(og) og.addEventListener("click",function(){ window.location.href = Backend.oauthUrl("google"); });
    var of=s.querySelector("#oauthFacebook"); if(of) of.addEventListener("click",function(){ window.location.href = Backend.oauthUrl("facebook"); });
    var sb=s.querySelector("#sendBtn");
    if(sb) sb.addEventListener("click",function(){
      var em=(s.querySelector("#email").value||"").trim();
      if(!em){ login.msg="Escribe tu correo."; render(); return; }
      login.email=em; login.busy=true; login.msg=""; render();
      Backend.sendOtp(em).then(function(){ login.busy=false; login.step="code"; login.msg=""; render(); })
        .catch(function(e){ login.busy=false; login.msg="No se pudo enviar: "+(e.message||"error"); render(); });
    });
  } else {
    var vb=s.querySelector("#verifyBtn");
    if(vb) vb.addEventListener("click",function(){
      var code=(s.querySelector("#code").value||"").trim();
      if(!code){ login.msg="Escribe el código."; render(); return; }
      login.busy=true; login.msg=""; render();
      Backend.verifyOtp(login.email, code).then(function(){ login.busy=false; backend.authed=true; return Backend.myProfile(); })
        .then(function(p){ backend.profile=p; login.step="email"; login.msg=""; var dest=login.returnTo||"admin"; login.returnTo=null; set({screen:dest}); })
        .catch(function(){ login.busy=false; login.msg="Código inválido o expirado."; render(); });
    });
    var be=s.querySelector("#backEmail");
    if(be) be.addEventListener("click",function(){ login.step="email"; login.msg=""; render(); });
  }
  return s;
}

function screenAdmin(){
  var s = el('<div class="screen"></div>');
  if(!(window.Backend && Backend.getSession())){
    setTimeout(function(){ set({screen:"login"}); }, 0);
    s.innerHTML = statusBar(false)
      + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Administrador</h1></div>'
      + '<div class="scroll"><div class="list"><div class="seis-card"><div class="seis-main">Redirigiendo al inicio de sesión…</div></div></div></div>';
    bindBack(s); return s;
  }
  var p = backend.profile;
  var isAdmin = p && p.role==="admin";
  var who = '<div class="ok-sub">'+esc(Backend.myEmail()||"")+' · rol: <b>'+esc((p&&p.role)||"ciudadano")+'</b>'+((p&&p.district)?(' · '+esc(p.district)):'')+'</div>';
  var body;
  if(!isAdmin){
    body = '<div class="list">'
      + '<div class="nino-ok" style="background:var(--ambar-fondo);color:var(--ambar-texto)">'+icon("clock",28,2.4)+'<div><b>Tu cuenta aún no es administrador</b><small>Pide al responsable que te asigne el rol en Supabase.</small></div></div>'
      + '<div class="seis-card" style="display:block"><div class="seis-main" style="word-break:break-all">Tu user id (para asignar el rol):<br><b>'+esc(Backend.myUserId()||"")+'</b></div></div>'
      + '<button class="demo-reset" id="signout" style="margin-top:14px">Cerrar sesión</button>'
      + '</div>';
  } else {
    var rows = dirEmerg().map(function(c){
      return '<div class="admin-row"><div class="di"><b>'+esc(c.name)+'</b><small>'+esc(c.tel||"")+(c.meta?(" · "+esc(c.meta)):"")+'</small></div>'
        + (c.id ? ('<button class="admin-del" data-del="'+esc(c.id)+'">Borrar</button>') : '<span class="admin-local">local</span>')+'</div>';
    }).join("");
    body = '<div class="list">'
      + '<div class="eyebrow" style="padding:4px 0 8px">Contactos de emergencia · '+esc(p.district)+'</div>'
      + rows
      + '<div class="admin-add">'
        + '<input class="finput" id="nName" placeholder="Nombre (ej. Comisaría San Isidro)">'
        + '<input class="finput" id="nPhone" placeholder="Teléfono (ej. 105)">'
        + '<input class="finput" id="nMeta" placeholder="Detalle (ej. 24 horas)">'
        + '<button class="btn-primary" id="addBtn">Agregar contacto</button>'
      + '</div>'
      + (adminMsg?'<div class="fmsg">'+esc(adminMsg)+'</div>':'')
      + '<button class="demo-reset" id="signout" style="margin-top:14px">Cerrar sesión</button>'
      + '</div>';
  }
  s.innerHTML = statusBar(false)
    + '<div class="head-row"><button class="back blue" data-back>'+icon("chevron",22,2.6)+'</button><h1>Administrador</h1></div>'
    + who + '<div class="scroll">'+body+'</div>';
  bindBack(s);
  var so=s.querySelector("#signout");
  if(so) so.addEventListener("click",function(){ Backend.signOut(); backend.authed=false; backend.profile=null; set({screen:"home"}); });
  if(isAdmin){
    s.querySelectorAll("[data-del]").forEach(function(b){ b.addEventListener("click",function(){
      var id=b.getAttribute("data-del"); adminMsg="";
      Backend.deleteContact(id).then(function(){ return Backend.fetchContent(state.distrito); })
        .then(function(d){ backend.contacts=d.contacts; backend.shelters=d.shelters; render(); })
        .catch(function(e){ adminMsg="No se pudo borrar: "+(e.message||"error"); render(); });
    });});
    var ab=s.querySelector("#addBtn");
    if(ab) ab.addEventListener("click",function(){
      var name=(s.querySelector("#nName").value||"").trim();
      var phone=(s.querySelector("#nPhone").value||"").trim();
      var meta=(s.querySelector("#nMeta").value||"").trim();
      if(!name||!phone){ adminMsg="Nombre y teléfono son obligatorios."; render(); return; }
      adminMsg="";
      Backend.insertContact({ district:p.district, name:name, phone:phone, meta:meta, scope:"local", critical:false, active:true, sort:100 })
        .then(function(){ return Backend.fetchContent(state.distrito); })
        .then(function(d){ backend.contacts=d.contacts; backend.shelters=d.shelters; render(); })
        .catch(function(e){ adminMsg="No se pudo agregar: "+(e.message||"error"); render(); });
    });
  }
  return s;
}

function screenAlerta(){
  var s = el('<div class="alerta"></div>');
  var steps = [["1","AGÁCHATE"],["2","CÚBRETE"],["3","SUJÉTATE"]];
  var magLine = currentAlertQuake
    ? ('Mag '+Number(currentAlertQuake.mag).toFixed(1)+' · '+(currentAlertQuake.place?esc(currentAlertQuake.place):('a '+currentAlertQuake.distKm+' km de Lima')))
    : 'Movimiento fuerte detectado · Mag. ~6.1 (demo)';
  s.innerHTML = statusBar(true)
  + '<div class="a-body">'
    + '<div class="a-eyebrow">Sismo en curso</div>'
    + '<div class="a-mag">'+magLine+'</div>'
    + steps.map(function(st){ return '<div class="a-card"><div class="num">'+st[0]+'</div><div class="word">'+st[1]+'</div></div>'; }).join("")
    + '<div class="a-reinforce">No corras.<br>No uses el ascensor.</div>'
  + '</div>'
  + '<button class="a-cta" id="estoybien">Estoy bien</button>'
  + '<div class="a-note">Toca cuando el movimiento pare para avisar a tus contactos</div>';
  s.querySelector("#estoybien").addEventListener("click",function(){
    set({alertActive:false, screen:"ok"});
  });
  return s;
}

var currentAlertQuake = null;
function triggerAlert(quake){
  currentAlertQuake = quake || null;
  var patch = {alertActive:true, screen:"alerta"};
  if(quake && quake.id){ patch.lastAlertedId = quake.id; }
  set(patch);
  if(navigator.vibrate){ try{navigator.vibrate([200,100,200]);}catch(e){} }
}

/* ---------------- render ---------------- */
function bindBack(s){ s.querySelectorAll("[data-back]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:"home"}); }); }); }

function render(){
  var device = document.getElementById("device");
  if(state.screen!=="ruta"){ if(routeMap) destroyRouteMap(); stopTracking(); }
  device.innerHTML = "";
  var view;
  switch(state.screen){
    case "casa": view=screenCasa(); break;
    case "kit": view=screenKit(); break;
    case "ruta": view=screenRuta(); break;
    case "ok": view=screenOk(); break;
    case "dir": view=screenDir(); break;
    case "nino": view=screenNino(); break;
    case "login": view=screenLogin(); break;
    case "admin": view=screenAdmin(); break;
    case "regpunto": view=screenRegPunto(); break;
    case "alerta": view=screenAlerta(); break;
    default: view=screenHome();
  }
  device.appendChild(view);
}

/* ---------------- init ---------------- */
hydrateSeismicFromCache();
igpLoadCache();
ninoLoadCache();
backendHydrate();
render();
startSeismic();
if(window.Backend && Backend.handleOAuthRedirect){
  Backend.handleOAuthRedirect().then(function(sess){
    if(sess){ backend.authed=true; Backend.myProfile().then(function(p){ backend.profile=p; render(); }); loadSafePoints(); }
  });
}
