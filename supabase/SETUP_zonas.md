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

## 3. Alimentar la capa de riesgo (datos oficiales — los pones tú)
No se incluyen datos reales. Dos formas de cargar polígonos (INDECI/CENEPRED):

**a) En la tabla `risk_zones`** (recomendado): inserta una fila por zona con su geometría GeoJSON:
```sql
insert into public.risk_zones (name, kind, severity, geometry, source) values
('Quebrada X','huaico','alto',
 '{"type":"Polygon","coordinates":[[[-77.05,-12.10],[-77.04,-12.10],[-77.04,-12.09],[-77.05,-12.09],[-77.05,-12.10]]]}'::jsonb,
 'CENEPRED 2025');
```
La app las lee solas y las dibuja.

**b) Desde el navegador** (sin tocar la BD), pasando un GeoJSON a la función expuesta:
```js
window.cargarRiesgo({ type:"FeatureCollection", features:[ /* ...tus polígonos... */ ] });
```

## Notas
- Las fotos son **privadas**: se muestran con *signed URLs* temporales; no son públicas.
- Todo respeta RLS: un usuario solo ve/edita sus propios puntos y fotos.
