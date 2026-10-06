#!/usr/bin/env python3
"""Fase 2 — Sismos del IGP (Centro Sismologico Nacional del Peru) para la PWA.

El IGP es la fuente autoritativa de sismos locales del Peru; su catalogo incluye
eventos que USGS no lista. Expone un JSON por anio en:
  https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/<anio>
pero sin cabeceras CORS, asi que el navegador no puede llamarlo directo. Este
script corre en GitHub Actions: descarga el/los anios, normaliza, calcula la
distancia a Lima y publica data/igp-sismos.json (recientes) para que la PWA lo
lea del mismo origen (sin CORS, cacheable offline).
"""
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/"
LIMA = (-12.046, -77.0428)  # (lat, lon)
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "igp-sismos.json")
KEEP = 60  # cantidad de sismos recientes a publicar


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2)
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_year(year):
    req = urllib.request.Request(BASE + str(year), headers={"User-Agent": "sismos-lima-pwa/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def to_ms(fecha_utc, hora_utc):
    # fecha_utc: "2026-10-05T00:00:00.000Z" (fecha) ; hora_utc: "1970-01-01T20:24:38.000Z" (hora)
    iso = fecha_utc[0:10] + "T" + hora_utc[11:19] + "Z"
    dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000), iso


def main():
    now = datetime.now(timezone.utc)
    years = [now.year]
    if now.month == 1:          # cerca de Año Nuevo, incluir diciembre anterior
        years.append(now.year - 1)

    raw = []
    for y in years:
        try:
            raw.extend(fetch_year(y))
        except Exception as e:  # noqa: BLE001
            print("WARN: no se pudo leer IGP %s (%s)" % (y, e), file=sys.stderr)

    if not raw:
        raise RuntimeError("sin datos de IGP")

    out = []
    for e in raw:
        try:
            ms, iso = to_ms(e["fecha_utc"], e["hora_utc"])
            lat = float(e["latitud"]); lon = float(e["longitud"])
            out.append({
                "codigo": e.get("codigo"),
                "magNum": float(e["magnitud"]),
                "place": e.get("referencia") or "",
                "time": ms,
                "timeIso": iso,
                "lat": lat, "lon": lon,
                "depth": e.get("profundidad"),
                "distKm": round(haversine_km(LIMA[0], LIMA[1], lat, lon)),
                "intensidad": e.get("intensidad") or "",
            })
        except Exception:
            continue

    out.sort(key=lambda q: q["time"], reverse=True)
    out = out[:KEEP]

    payload = {
        "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "IGP - Centro Sismologico Nacional (ultimosismo.igp.gob.pe)",
        "count": len(out),
        "sismos": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    top = out[0] if out else None
    print("OK: %d sismos IGP. Mas reciente: %s" % (len(out), (("M%s %s" % (top["magNum"], top["place"])) if top else "n/a")))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 — no romper el deploy; conservar archivo previo
        print("WARN: no se pudo actualizar IGP (%s); se conserva el archivo existente." % e, file=sys.stderr)
        sys.exit(0)
