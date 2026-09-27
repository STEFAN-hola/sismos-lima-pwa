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
  directoryTab:"emerg"
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
  + '</div>';

  s.querySelectorAll("[data-nav]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:b.getAttribute("data-nav")}); }); });
  s.querySelector("#simular").addEventListener("click",function(){ triggerAlert(); });
  s.querySelector("#toggleData").addEventListener("click",function(){ set({hasMobileData:!state.hasMobileData}); });
  s.querySelector("#reset").addEventListener("click",function(){ state=Object.assign({},defaults); save(); render(); });
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

function screenRuta(){
  var s = el('<div class="screen"></div>');
  s.innerHTML = statusBar(false)
  + '<div class="scroll" style="display:flex;flex-direction:column">'
    + '<div class="map">'
      + '<div class="ave-h"></div><div class="ave-v"></div><div class="park"></div>'
      + '<svg class="route" viewBox="0 0 390 474" preserveAspectRatio="none">'
        + '<path d="M60 520 L60 300 L172 300 L172 160 L250 160" fill="none" stroke="#0E4C7E" stroke-opacity="0.25" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M60 520 L60 300 L172 300 L172 160 L250 160" fill="none" stroke="#0E4C7E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/>'
      + '</svg>'
      + '<div class="map-overlay"><button class="back" data-back>'+icon("chevron",22,2.6)+'</button>'
        + '<div class="map-chip"><span class="dot"></span>Mapa guardado · sin internet</div></div>'
      + '<div class="user-dot">'+icon("home",22,2.4)+'</div>'
      + '<div class="dest"><div class="pill">Punto seguro</div><div class="pin">'+icon("pin",30,2.4)+'</div></div>'
    + '</div>'
    + '<div class="sheet">'
      + '<div><div class="eyebrow" style="color:var(--verde-oscuro)">Punto de encuentro más cercano</div>'
        + '<div class="r-name">Parque El Olivar</div></div>'
      + '<div class="stats"><div class="stat"><div class="s-l">Distancia</div><div class="s-v">340 m</div></div>'
        + '<div class="stat"><div class="s-l">A pie</div><div class="s-v">4 min</div></div></div>'
      + '<div class="instr">'+icon("arrow",22,2.4)+'<span>Baja por Av. Los Incas y cruza a la derecha en el parque.</span></div>'
      + '<button class="cta-tall" data-nav="dir">Iniciar mi ruta</button>'
    + '</div>'
  + '</div>';
  s.querySelectorAll("[data-nav]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:b.getAttribute("data-nav")}); }); });
  bindBack(s);
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
    rows = EMERG.map(function(e){
      return '<div class="dir-row'+(e.critical?' critical':'')+'">'
        + '<div class="di"><b>'+esc(e.name)+'</b><small>'+esc(e.meta)+'</small></div>'
        + '<a class="dir-act" href="tel:'+esc(e.tel)+'" aria-label="Llamar a '+esc(e.name)+'">'+icon("phone",26,2.3)+'</a></div>';
    }).join("");
  }else{
    rows = ALB.map(function(a){
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

function screenAlerta(){
  var s = el('<div class="alerta"></div>');
  var steps = [["1","AGÁCHATE"],["2","CÚBRETE"],["3","SUJÉTATE"]];
  s.innerHTML = statusBar(true)
  + '<div class="a-body">'
    + '<div class="a-eyebrow">Sismo en curso</div>'
    + '<div class="a-mag">Movimiento fuerte detectado · Mag. ~6.1</div>'
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

function triggerAlert(){
  set({alertActive:true, screen:"alerta"});
  if(navigator.vibrate){ try{navigator.vibrate([200,100,200]);}catch(e){} }
}

/* ---------------- render ---------------- */
function bindBack(s){ s.querySelectorAll("[data-back]").forEach(function(b){ b.addEventListener("click",function(){ set({screen:"home"}); }); }); }

function render(){
  var device = document.getElementById("device");
  device.innerHTML = "";
  var view;
  switch(state.screen){
    case "casa": view=screenCasa(); break;
    case "kit": view=screenKit(); break;
    case "ruta": view=screenRuta(); break;
    case "ok": view=screenOk(); break;
    case "dir": view=screenDir(); break;
    case "alerta": view=screenAlerta(); break;
    default: view=screenHome();
  }
  device.appendChild(view);
}
render();
