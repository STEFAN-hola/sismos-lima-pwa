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

## Límites de este MVP (siguientes fases)

- Sin backend ni autenticación (datos y contactos son de ejemplo, viven en el dispositivo).
- La alerta se dispara con el botón demo; falta integrar la fuente sísmica real (IGP / USGS).
- El "estoy bien" no envía SMS de verdad todavía; requiere una pasarela (p. ej. Twilio) vía un endpoint seguro.
- El mapa es esquemático; producción necesita tiles offline reales por distrito (MapLibre/MBTiles).
- Falta reconocimiento de imágenes en "Revisar mi casa".

Ver la propuesta de arquitectura para el plan completo por fases.
