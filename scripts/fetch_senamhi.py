#!/usr/bin/env python3
"""Fase 2 — Avisos de lluvia (El Nino) de SENAMHI para la PWA.

SENAMHI no expone una API REST con CORS; sus avisos oficiales viven en un
GeoServer WFS (IDESEP) que devuelve GeoJSON pero sin cabeceras CORS, asi que
el navegador no puede llamarlo directo. Este script corre en GitHub Actions:
descarga el WFS, recorta a lo esencial, marca que avisos incluyen Lima
(point-in-polygon) y descarta la geometria pesada (~2.3 MB -> ~5 KB).
El resultado (data/senamhi-avisos.json) se publica junto a la PWA y se lee
del mismo origen, sin CORS y cacheable offline.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

WFS = (
    "https://idesep.senamhi.gob.pe/geoserver/g_prono_pp_24h/ows"
    "?service=WFS&version=1.0.0&request=GetFeature"
    "&typeName=g_prono_pp_24h:view_aviso24h&outputFormat=application/json"
)
LIMA = (-77.0428, -12.046)  # (lon, lat) — Lima Metropolitana
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "senamhi-avisos.json")


def point_in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def affects(geom, lon, lat):
    if not geom:
        return False
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    try:
        if t == "MultiPolygon":
            return any(point_in_ring(lon, lat, poly[0]) for poly in coords)
        if t == "Polygon":
            return point_in_ring(lon, lat, coords[0])
    except Exception:
        return False
    return False


def main():
    req = urllib.request.Request(WFS, headers={"User-Agent": "sismos-lima-pwa/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        gj = json.load(r)

    avisos = []
    for f in gj.get("features", []):
        p = f.get("properties", {}) or {}
        m = re.search(r"(\d+)", str(p.get("nivel", "")))
        avisos.append({
            "gid": p.get("gid"),
            "nivel": str(p.get("nivel", "")),
            "nivelNum": int(m.group(1)) if m else 0,
            "fecha": str(p.get("fecha", "")),
            "descripcion": p.get("descripcio", ""),
            "recomendacion": p.get("recomendac", ""),
            "afectaLima": bool(affects(f.get("geometry"), *LIMA)),
        })

    lima_count = sum(1 for a in avisos if a["afectaLima"])
    out = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "IDESEP SENAMHI WFS g_prono_pp_24h:view_aviso24h (aviso de lluvias 24h)",
        "total": len(avisos),
        "limaAfectada": lima_count > 0,
        "limaCount": lima_count,
        "avisos": avisos,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("OK: %d avisos, Lima afectada=%s (%d)" % (len(avisos), out["limaAfectada"], lima_count))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 — no romper el deploy; conservar archivo previo
        print("WARN: no se pudo actualizar SENAMHI (%s); se conserva el archivo existente." % e,
              file=sys.stderr)
        sys.exit(0)
