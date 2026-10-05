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

  return {
    configured: configured,
    fetchContent: fetchContent,
    sendOtp: sendOtp, verifyOtp: verifyOtp, signOut: signOut,
    getSession: getSession, token: token, myProfile: myProfile, myEmail: myEmail, myUserId: myUserId,
    insertContact: insertContact, updateContact: updateContact, deleteContact: deleteContact
  };
})();
