# Zonas seguras — configuración en Supabase

Funcionalidad: cada usuario registra **puntos seguros** en su vivienda (foto + descripción
+ categoría, geolocalizados y privados) y la app muestra una **capa de riesgo** general
que tú alimentas con datos oficiales. Requiere `schema.sql` ya aplicado.

## 1. Crear tablas + bucket
En **SQL Editor**, pega y corre `supabase/schema_zonas.sql`. Eso crea:
- columnas `home_*` en `profiles`,
- tabla `safe_points` (privada por usuario, RLS),
- tabla `risk_zones` (vacía; lectura pública, escritura admin),
- bucket de Storage **`safe-points`** (privado) + políticas para que cada quien solo
  acceda a sus propias fotos.

## 2. Login del ciudadano (para guardar puntos personales)
Los puntos personales necesitan usuario autenticado.
- **Correo (OTP):** ya está activo (no requiere nada más).
- **Google / Facebook (opcional):** en **Authentication → Providers**, habilita Google y/o
  Facebook y pega sus credenciales:
  - **Google:** crea un OAuth Client en Google Cloud Console → copia *Client ID* y *Secret*.
  - **Facebook:** crea una app en developers.facebook.com → *App ID* y *App Secret*.
  - En **Authentication → URL Configuration → Redirect URLs**, agrega:
    `https://stefan-hola.github.io/sismos-lima-pwa/`
  > Hasta que configures Google/Facebook, esos botones darán error; el correo OTP funciona igual.

## 3. Alimentar la capa de riesgo con SIGRID / INGEMMET (datos oficiales)
No se incluyen datos reales. Para subir las zonas oficiales:

**Paso 1 — exporta la capa a GeoJSON**
- **SIGRID (CENEPRED):** entra a `sigrid.cenepred.gob.pe`, busca la capa de peligros
  que te interese (p. ej. *Inventario de Peligros Geológicos*, zonas por huaico/inundación)
  y **descárgala** (shapefile/GDB). Sus servicios ArcGIS REST también existen en
  `sigrid.cenepred.gob.pe/arcgis/rest/services/` (algunas capas abiertas pueden consultarse
  con `.../<id>/query?where=1=1&outFields=*&f=geojson&outSR=4326`).
- **INGEMMET:** usa **GEOCATMIN** (`geocatmin.ingemmet.gob.pe`) para peligros geológicos:
  descarga la capa o usa su servicio ArcGIS.
- Si bajó como **shapefile**, conviértelo a **GeoJSON** gratis y sin instalar nada en
  **https://mapshaper.org** (arrastra el `.shp`+`.dbf`+`.shx` → *Export* → GeoJSON).
  Reproyecta a WGS84 (EPSG:4326) si hace falta.

**Paso 2 — cárgalo en la app (cualquiera de estas):**
- **Panel admin (recomendado):** inicia sesión, abre **Panel admin → Capa de riesgo
  (SIGRID / INGEMMET)**, pega el GeoJSON y pulsa **Cargar capa**. Se guarda en `risk_zones`
  y se dibuja en el mapa. "Borrar capa" la limpia.
  > Campos que la app reconoce por feature: `name`/`NOMBRE`, `kind`/`tipo`/`peligro`,
  > `severity`/`nivel`/`grado` (para el color). El resto se guarda en `properties`.
- **Por SQL:** inserta una fila por zona:
  ```sql
  insert into public.risk_zones (name, kind, severity, geometry, source) values
  ('Quebrada X','huaico','alto',
   '{"type":"Polygon","coordinates":[[[-77.05,-12.10],[-77.04,-12.10],[-77.04,-12.09],[-77.05,-12.09],[-77.05,-12.10]]]}'::jsonb,
   'CENEPRED/SIGRID');
  ```
- **Desde el navegador** (temporal, sin guardar en BD):
  ```js
  window.cargarRiesgo({ type:"FeatureCollection", features:[ /* ...polígonos... */ ] });
  ```

## Notas
- Las fotos son **privadas**: se muestran con *signed URLs* temporales; no son públicas.
- Todo respeta RLS: un usuario solo ve/edita sus propios puntos y fotos.
