# Sismos Lima — PWA (MVP, Wirbi)

App web progresiva (PWA) instalable para prevención y respuesta ante sismos en Lima Metropolitana. Funciona **sin internet** una vez cargada la primera vez.

Es un MVP **sin build step**: HTML + CSS + JS planos. No necesita Node, npm ni bundler. Se despliega subiendo la carpeta tal cual.

## Contenido

```
sismos-lima-pwa/
├── index.html                 # shell de la app + registro del service worker
├── styles.css                 # design tokens del handoff + estilos
├── app.js                     # estado, navegación y las 7 pantallas
├── manifest.webmanifest       # metadatos de instalación (nombre, iconos, colores)
├── sw.js                      # service worker: caché offline del app shell
├── seismic.js                 # datos sísmicos reales (USGS)
├── icons/                     # iconos PNG (192, 512, maskable, apple-touch)
├── data/
│   └── senamhi-avisos.json    # avisos de lluvia SENAMHI (generado en cada deploy)
├── scripts/
│   └── fetch_senamhi.py       # scraper del WFS de SENAMHI (corre en CI)
└── .github/workflows/         # deploy + refresco automático (cada 3 h)
```

## Pantallas

Inicio · Revisar mi casa (vulnerabilidad) · Ruta de evacuación · Mi kit de emergencia · Alerta activa (takeover) · Estoy bien (SMS/instantáneo) · Contactos y albergues.

El estado (checklists, kit, recordatorio) se guarda en `localStorage` del dispositivo. En Inicio hay una sección **demo** (no va en producción) para simular un sismo, alternar "datos móviles" y reiniciar el progreso.

## Probar en local

El service worker necesita **HTTP** (no funciona con `file://`). Levanta un servidor estático desde esta carpeta:

```bash
# Con Node (npx, sin instalar nada global)
npx serve .

# o con Python 3
python -m http.server 8080
```

Luego abre `http://localhost:8080`. Para probar la instalación PWA y el modo offline usa Chrome/Edge → DevTools → pestaña **Application**.

> Nota: la instalación PWA "real" solo aparece bajo **HTTPS** (o localhost). Cualquiera de los hosts gratuitos de abajo da HTTPS automático.

## Desplegar gratis

### Opción 1 — Netlify Drop (lo más rápido, sin cuenta técnica)
1. Entra a https://app.netlify.com/drop
2. Arrastra **la carpeta `sismos-lima-pwa` completa**.
3. Listo: te da una URL HTTPS pública. Para actualizar, vuelve a arrastrar.

### Opción 2 — Vercel
1. `npm i -g vercel` (o usa el dashboard web e importa el repo).
2. Desde la carpeta: `vercel` y sigue el asistente. Framework: **Other**. Sin build command.

### Opción 3 — GitHub Pages (con CI incluido)
1. Crea un repo y sube esta carpeta como raíz.
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `push` a `main` publica solo (ver `.github/workflows/deploy-pages.yml`).

## Al actualizar el código

El service worker cachea el app shell. Si cambias `index.html`, `styles.css` o `app.js`, **sube el número** en `sw.js`:

```js
var CACHE_VERSION = "sismos-lima-v2"; // v1 -> v2
```

Así el navegador descarta la caché vieja y sirve la versión nueva.

## Fase 2 — Sismos del IGP (fuente primaria para Perú)

USGS es un catálogo global y **no lista muchos sismos locales del Perú**. El **IGP**
(Centro Sismológico Nacional) sí los registra. Su API por año
(`ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/<año>`) no tiene CORS, así que
`scripts/fetch_igp.py` corre en **GitHub Actions** (cada 30 min y en cada deploy):
descarga, normaliza fecha/hora UTC, calcula la distancia a Lima y publica los
~60 sismos más recientes en `data/igp-sismos.json`. La PWA lo lee del mismo
origen (sin CORS, cacheable offline). La tarjeta "Actividad sísmica reciente"
usa **IGP como fuente primaria** y **USGS como respaldo**.

## Fase 2 — Datos sísmicos (USGS, respaldo en vivo)

`seismic.js` consulta la **API pública de USGS** (gratis, sin API key, con CORS) para traer la actividad sísmica cerca de Lima (últimas 24 h, radio 500 km). En Inicio se muestra el último sismo (magnitud, hace cuánto, distancia, profundidad) con estado online/offline y la fuente.

- **Auto-alerta:** si aparece un sismo de magnitud ≥ 5.0 a ≤ 300 km de Lima dentro de los últimos 15 min, la app dispara automáticamente el takeover de alerta con la magnitud real. Regla conservadora para evitar falsas alarmas; ajústala en `ALERT_RULE` (`app.js`).
- **Offline:** el último resultado se cachea en `localStorage`; sin conexión se muestra el guardado con su antigüedad.
- **Importante:** USGS reporta sismos **ya ocurridos** (latencia de minutos); **no es alerta temprana**. La alerta temprana oficial en Perú es el **SASPe del IGP** — integrarla es una fase posterior.

## Fase 2 (en curso) — Riesgo por El Niño (avisos de lluvia de SENAMHI)

SENAMHI **no tiene API REST con CORS**; sus avisos oficiales de lluvia viven en un **GeoServer WFS** de IDESEP (`g_prono_pp_24h:view_aviso24h`) que devuelve GeoJSON sin cabeceras CORS, así que el navegador no puede llamarlo directo. Solución sin hosting extra:

- `scripts/fetch_senamhi.py` corre en **GitHub Actions** (en cada deploy y cada 3 h vía cron), descarga el WFS, marca qué avisos incluyen Lima con *point-in-polygon*, descarta la geometría pesada (~2.3 MB → ~5 KB) y escribe `data/senamhi-avisos.json`.
- Ese archivo se publica junto a la PWA y se lee **del mismo origen** (sin CORS, cacheable offline).
- En Inicio aparece la tarjeta "Avisos de lluvia · El Niño (SENAMHI)" y, al tocarla, la pantalla de detalle con nivel, descripción y recomendación de cada aviso que afecta a Lima.
- El Niño en Lima/costa se traduce sobre todo en **lluvias intensas → huaicos y desbordes**; por eso se usa el aviso de lluvias de 24 h.

> Para cambiar la frecuencia, edita el `cron` en `.github/workflows/deploy-pages.yml`. Para otra ciudad, cambia `LIMA` en `scripts/fetch_senamhi.py`.

## Fase 2 — Zonas seguras (puntos personales + capa de riesgo)

En el mapa de "Ruta de evacuación" hay dos capas conmutables:
- **Mis puntos seguros** (por usuario, privados): el usuario registra puntos en su
  vivienda con **foto (cámara)**, descripción y categoría (antisísmica / evacuación
  por huaico), geolocalizados. Requieren iniciar sesión (correo OTP, o Google/Facebook
  si se configuran en Supabase). Fotos en **Supabase Storage** (bucket privado, signed URLs).
- **Riesgo general** (huaicos/fallas): se dibuja desde un **GeoJSON que tú alimentas**
  (tabla `risk_zones` o `window.cargarRiesgo(geojson)`); **no incluye datos reales**.

Setup en `supabase/SETUP_zonas.md` + SQL en `supabase/schema_zonas.sql`. El mapa usa
**MapLibre** (ver `map.js`: `renderSafePoints`, `renderRiskLayer`).

## Límites pendientes (siguientes fases)

- Sin backend ni autenticación/roles (datos y contactos son de ejemplo, viven en el dispositivo) → Supabase.
- El "estoy bien" no envía SMS de verdad todavía; requiere una pasarela (p. ej. Twilio) vía un endpoint seguro.
- El mapa es esquemático; producción necesita tiles offline reales por distrito (MapLibre/MBTiles).
- Falta reconocimiento de imágenes en "Revisar mi casa".
- Integrar el feed de alerta temprana del IGP (SASPe) cuando haya acceso.

Ver la propuesta de arquitectura para el plan completo por fases.
