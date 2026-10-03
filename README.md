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
├── icons/                     # iconos PNG (192, 512, maskable, apple-touch)
└── .github/workflows/         # deploy automático a GitHub Pages
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

## Fase 2 (en curso) — Datos sísmicos reales

`seismic.js` consulta la **API pública de USGS** (gratis, sin API key, con CORS) para traer la actividad sísmica cerca de Lima (últimas 24 h, radio 500 km). En Inicio se muestra el último sismo (magnitud, hace cuánto, distancia, profundidad) con estado online/offline y la fuente.

- **Auto-alerta:** si aparece un sismo de magnitud ≥ 5.0 a ≤ 300 km de Lima dentro de los últimos 15 min, la app dispara automáticamente el takeover de alerta con la magnitud real. Regla conservadora para evitar falsas alarmas; ajústala en `ALERT_RULE` (`app.js`).
- **Offline:** el último resultado se cachea en `localStorage`; sin conexión se muestra el guardado con su antigüedad.
- **Importante:** USGS reporta sismos **ya ocurridos** (latencia de minutos); **no es alerta temprana**. La alerta temprana oficial en Perú es el **SASPe del IGP** — integrarla es una fase posterior.

## Límites pendientes (siguientes fases)

- Sin backend ni autenticación/roles (datos y contactos son de ejemplo, viven en el dispositivo) → Supabase.
- El "estoy bien" no envía SMS de verdad todavía; requiere una pasarela (p. ej. Twilio) vía un endpoint seguro.
- El mapa es esquemático; producción necesita tiles offline reales por distrito (MapLibre/MBTiles).
- Falta reconocimiento de imágenes en "Revisar mi casa".
- Integrar el feed de alerta temprana del IGP (SASPe) cuando haya acceso.

Ver la propuesta de arquitectura para el plan completo por fases.
