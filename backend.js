"use strict";

/* Backend (Fase 2) — cliente mínimo de Supabase con fetch (sin librería CDN).
   - Lecturas de contenido con la anon key (RLS: solo filas activas).
   - Auth de admin por OTP de correo (endpoints GoTrue).
   - Escrituras con el token del usuario (RLS: solo admin de su distrito).
   Todo degrada con gracia: sin red o sin config, la app usa datos locales. */
var Backend = (function () {
  var URL = (typeof window !== "undefined" && window.SUPABASE_URL) || "";
  var KEY = (typeof window !== "undefined" && window.SUPABASE_ANON_KEY) || "";
  var SESSION = "sismos_lima_session_v1";

  function configured(){ return !!(URL && KEY); }

  function getSession(){
    try{ var s = JSON.parse(localStorage.getItem(SESSION));
      if(s && s.access_token && (!s.expires_at || s.expires_at*1000 > Date.now())) return s;
    }catch(e){}
    return null;
  }
  function setSession(s){ try{ localStorage.setItem(SESSION, JSON.stringify(s)); }catch(e){} }
  function clearSession(){ try{ localStorage.removeItem(SESSION); }catch(e){} }
  function token(){ var s = getSession(); return s ? s.access_token : null; }

  function rest(path, opts){
    opts = opts || {};
    var h = { "apikey": KEY, "Authorization": "Bearer " + (opts.bearer || token() || KEY) };
    if(opts.body){ h["Content-Type"] = "application/json"; }
    if(opts.prefer){ h["Prefer"] = opts.prefer; }
    return fetch(URL + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function(r){
        return r.text().then(function(t){
          var data = t ? JSON.parse(t) : null;
          if(!r.ok){ var e = new Error((data && (data.message||data.error_description||data.msg)) || ("HTTP "+r.status)); e.status=r.status; e.data=data; throw e; }
          return data;
        });
      });
  }

  // ---- lecturas de contenido ----
  function fetchContent(district){
    var d = encodeURIComponent(district);
    return Promise.all([
      rest("/rest/v1/shelters?select=id,name,meta,lat,lon,sort&active=eq.true&district=eq."+d+"&order=sort"),
      rest("/rest/v1/emergency_contacts?select=id,name,phone,meta,critical,scope,sort&active=eq.true&district=eq."+d+"&order=sort"),
      rest("/rest/v1/evacuation_points?select=id,name,lat,lon,instructions&active=eq.true&district=eq."+d)
    ]).then(function(res){
      return {
        shelters: (res[0]||[]).map(function(s){ return { id:s.id, name:s.name, meta:s.meta, lat:s.lat, lon:s.lon }; }),
        contacts: (res[1]||[]).map(function(c){ return { id:c.id, name:c.name, tel:c.phone, meta:c.meta, critical:!!c.critical, scope:c.scope }; }),
        evac: (res[2]||[]).map(function(e){ return { id:e.id, name:e.name, lat:e.lat, lon:e.lon, instructions:e.instructions }; })
      };
    });
  }

  // ---- auth OTP por correo ----
  function sendOtp(email){
    return rest("/auth/v1/otp", { method:"POST", bearer:KEY, body:{ email:email, create_user:true } });
  }
  function verifyOtp(email, code){
    return rest("/auth/v1/verify", { method:"POST", bearer:KEY, body:{ type:"email", email:email, token:code } })
      .then(function(s){ if(s && s.access_token){ setSession(s); } return s; });
  }
  function signOut(){ clearSession(); }

  function myProfile(){
    if(!token()) return Promise.resolve(null);
    return rest("/rest/v1/profiles?select=role,district,full_name")
      .then(function(a){ return (a && a[0]) || null; })
      .catch(function(){ return null; });
  }
  function myEmail(){ var s=getSession(); return s && s.user ? s.user.email : null; }
  function myUserId(){ var s=getSession(); return s && s.user ? s.user.id : null; }

  // ---- escrituras de admin (contactos) ----
  function insertContact(row){
    return rest("/rest/v1/emergency_contacts", { method:"POST", prefer:"return=representation", body:row });
  }
  function updateContact(id, patch){
    return rest("/rest/v1/emergency_contacts?id=eq."+encodeURIComponent(id), { method:"PATCH", prefer:"return=representation", body:patch });
  }
  function deleteContact(id){
    return rest("/rest/v1/emergency_contacts?id=eq."+encodeURIComponent(id), { method:"DELETE", prefer:"return=representation" });
  }

  // ---- puntos seguros personales ----
  function listSafePoints(){
    return rest("/rest/v1/safe_points?select=id,category,description,lat,lon,photo_path,created_at&order=created_at.desc");
  }
  function insertSafePoint(row){
    return rest("/rest/v1/safe_points", { method:"POST", prefer:"return=representation", body:row }).then(function(a){ return (a&&a[0])||null; });
  }
  function deleteSafePoint(id){
    return rest("/rest/v1/safe_points?id=eq."+encodeURIComponent(id), { method:"DELETE", prefer:"return=representation" });
  }

  // ---- fotos en Storage (bucket privado 'safe-points') ----
  function uploadSafePhoto(path, file){
    var t = token();
    return fetch(URL + "/storage/v1/object/safe-points/" + path, {
      method:"POST",
      headers:{ "apikey":KEY, "Authorization":"Bearer "+(t||KEY), "Content-Type": (file && file.type) || "image/jpeg", "x-upsert":"true" },
      body: file
    }).then(function(r){ if(!r.ok) return r.text().then(function(tx){ throw new Error("upload "+r.status+": "+tx); }); return r.json(); });
  }
  function signedPhotoUrl(path, expires){
    return rest("/storage/v1/object/sign/safe-points/" + path, { method:"POST", body:{ expiresIn: expires||3600 } })
      .then(function(d){ return (d && d.signedURL) ? (URL + "/storage/v1" + d.signedURL) : null; });
  }

  // ---- capa de riesgo (lectura pública) ----
  function fetchRiskZones(){
    return rest("/rest/v1/risk_zones?select=name,kind,severity,geometry,properties&active=eq.true").then(function(rows){
      return { type:"FeatureCollection", features:(rows||[]).filter(function(r){ return r.geometry; }).map(function(r){
        return { type:"Feature", geometry:r.geometry, properties: Object.assign({ name:r.name, kind:r.kind, severity:r.severity }, r.properties||{}) };
      }) };
    });
  }

  // ---- capa de riesgo: carga/borrado (admin) ----
  function insertRiskZones(rows){
    return rest("/rest/v1/risk_zones", { method:"POST", prefer:"return=representation", body:rows });
  }
  function clearRiskZones(){
    return rest("/rest/v1/risk_zones?id=neq.00000000-0000-0000-0000-000000000000", { method:"DELETE", prefer:"return=representation" });
  }

  // ---- OAuth (Google / Facebook) ----
  function oauthUrl(provider){
    var appUrl = window.location.origin + window.location.pathname;
    return URL + "/auth/v1/authorize?provider=" + encodeURIComponent(provider) + "&redirect_to=" + encodeURIComponent(appUrl);
  }
  function handleOAuthRedirect(){
    var h = window.location.hash || "";
    if(h.indexOf("access_token=") === -1) return Promise.resolve(null);
    var p = {}; h.replace(/^#/,"").split("&").forEach(function(kv){ var i=kv.indexOf("="); if(i>0) p[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1)); });
    if(!p.access_token) return Promise.resolve(null);
    var sess = { access_token:p.access_token, refresh_token:p.refresh_token,
      expires_at: p.expires_at ? parseInt(p.expires_at,10) : (Math.floor(Date.now()/1000) + parseInt(p.expires_in||"3600",10)) };
    try{ history.replaceState(null, "", window.location.pathname + window.location.search); }catch(e){}
    return fetch(URL + "/auth/v1/user", { headers:{ "apikey":KEY, "Authorization":"Bearer "+sess.access_token } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(u){ if(u){ sess.user = u; } setSession(sess); return sess; })
      .catch(function(){ setSession(sess); return sess; });
  }

  return {
    configured: configured,
    fetchContent: fetchContent,
    sendOtp: sendOtp, verifyOtp: verifyOtp, signOut: signOut,
    getSession: getSession, token: token, myProfile: myProfile, myEmail: myEmail, myUserId: myUserId,
    insertContact: insertContact, updateContact: updateContact, deleteContact: deleteContact,
    listSafePoints: listSafePoints, insertSafePoint: insertSafePoint, deleteSafePoint: deleteSafePoint,
    uploadSafePhoto: uploadSafePhoto, signedPhotoUrl: signedPhotoUrl,
    fetchRiskZones: fetchRiskZones, insertRiskZones: insertRiskZones, clearRiskZones: clearRiskZones,
    oauthUrl: oauthUrl, handleOAuthRedirect: handleOAuthRedirect
  };
})();
