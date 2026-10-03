# Backend Supabase — pasos de configuración (Fase 2)

Objetivo: base de datos con **roles** (ciudadano/admin) y **contenido por distrito**
(albergues, teléfonos, puntos de evacuación) que el admin puede gestionar. El
ciudadano usa la app sin cuenta; solo el admin inicia sesión.

> Tú haces los pasos 1–5 (requieren tu cuenta). Luego me pasas **Project URL** y
> **anon key** (son públicas) y yo conecto la PWA. **Nunca** compartas la
> `service_role` key.

## 1. Crear el proyecto (gratis)
1. Entra a https://supabase.com y crea una cuenta (o inicia sesión).
2. **New project** → nombre `sismos-lima` → define una contraseña de base de datos
   (guárdala, no me la pases) → región **South America (São Paulo)** → **Create**.
3. Espera ~2 min a que se aprovisione.

## 2. Crear las tablas y la seguridad
1. En el menú izquierdo: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql` de este repo, copia **todo** su contenido,
   pégalo y pulsa **Run**. Debe decir "Success".

## 3. Activar el login por correo (OTP)
1. **Authentication** → **Providers** → **Email**: déjalo habilitado.
2. **Authentication** → **Sign In / Providers** (o **Email**): activa **"Email OTP"**
   (código por correo). Así el admin entra con un código, sin contraseña.
   > El login por SMS existe pero cobra (requiere Twilio); para el admin, el correo es gratis.

## 4. Obtener las llaves que necesito
1. **Project Settings** (engranaje) → **API**.
2. Cópiame estos dos valores:
   - **Project URL** (ej. `https://abcdxyz.supabase.co`)
   - **anon public** key (empieza con `eyJ...`) — es pública, segura para el cliente.
3. **NO** copies la `service_role` key (es secreta; si la ves, ignórala).

## 5. (Después de conectar) Nombrar un administrador
Cuando ya probemos el login, la persona admin inicia sesión una vez; luego, en
**SQL Editor**, ejecutas:

```sql
update public.profiles
  set role = 'admin', district = 'San Isidro', full_name = 'Nombre Apellido'
  where id = (select id from auth.users where email = 'admin@ejemplo.com');
```

## Qué haré yo cuando me pases URL + anon key
- Cargar `supabase-js` en la PWA.
- Hacer que la app **lea albergues/contactos/puntos desde Supabase**, con
  *fallback* al contenido local cuando esté offline.
- Agregar una **pantalla de login de admin** (OTP por correo) y, al entrar como
  admin, un editor básico del contenido de su distrito.
- Mantener al ciudadano **sin fricción** (sigue sin necesitar cuenta).

## Seguridad (ya incluida en el esquema)
- **RLS activo** en todas las tablas: lectura pública solo de lo `active`; escritura
  solo para el `admin` del distrito correspondiente.
- La columna `role` **no se puede auto-escalar** desde el cliente (trigger de
  protección); los roles se asignan por SQL del dueño del proyecto.
- La `anon key` es pública por diseño; la seguridad real la da RLS, no ocultar la key.
