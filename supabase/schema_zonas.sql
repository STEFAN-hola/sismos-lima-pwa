-- ============================================================================
-- Sismos Lima — Zonas seguras (puntos personales del usuario + capa de riesgo)
-- Ejecutar en Supabase Studio -> SQL Editor -> Run.  Requiere schema.sql previo.
-- ============================================================================

-- 1) Vivienda georreferenciada en el perfil
alter table public.profiles add column if not exists home_lat   double precision;
alter table public.profiles add column if not exists home_lon   double precision;
alter table public.profiles add column if not exists home_label text;

-- 2) Puntos seguros personales (privados por usuario)
create table if not exists public.safe_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category    text not null check (category in ('antisismica','evacuacion_huaico')),
  description text,
  lat         double precision,
  lon         double precision,
  photo_path  text,                      -- ruta en Storage: <user_id>/<id>.jpg
  created_at  timestamptz not null default now()
);
alter table public.safe_points enable row level security;

drop policy if exists "safe_points: dueño lee"      on public.safe_points;
drop policy if exists "safe_points: dueño inserta"  on public.safe_points;
drop policy if exists "safe_points: dueño actualiza" on public.safe_points;
drop policy if exists "safe_points: dueño borra"    on public.safe_points;
create policy "safe_points: dueño lee"       on public.safe_points for select using (user_id = auth.uid());
create policy "safe_points: dueño inserta"   on public.safe_points for insert with check (user_id = auth.uid());
create policy "safe_points: dueño actualiza" on public.safe_points for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "safe_points: dueño borra"     on public.safe_points for delete using (user_id = auth.uid());

-- 3) Capa de riesgo general (polígonos/geometrías) — la alimentas tú con datos
--    oficiales (INDECI/CENEPRED). Vacía por defecto; NO se incluyen datos reales.
create table if not exists public.risk_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  kind       text,                       -- 'huaico' | 'falla_sismica' | ...
  severity   text,                       -- 'bajo' | 'medio' | 'alto' | ...
  geometry   jsonb,                      -- GeoJSON geometry (Polygon/MultiPolygon/Point)
  properties jsonb,
  source     text,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.risk_zones enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

drop policy if exists "risk_zones: lectura pública" on public.risk_zones;
drop policy if exists "risk_zones: admin escribe"   on public.risk_zones;
create policy "risk_zones: lectura pública" on public.risk_zones for select using (active = true);
create policy "risk_zones: admin escribe"   on public.risk_zones for all using (public.is_admin()) with check (public.is_admin());

-- 4) Storage: bucket privado para las fotos de los puntos seguros
insert into storage.buckets (id, name, public)
  values ('safe-points', 'safe-points', false)
  on conflict (id) do nothing;

-- Cada usuario gestiona SOLO los objetos bajo su carpeta  <user_id>/...
drop policy if exists "safe-points: dueño lee"   on storage.objects;
drop policy if exists "safe-points: dueño sube"  on storage.objects;
drop policy if exists "safe-points: dueño borra" on storage.objects;
create policy "safe-points: dueño lee"  on storage.objects for select
  using (bucket_id = 'safe-points' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "safe-points: dueño sube" on storage.objects for insert
  with check (bucket_id = 'safe-points' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "safe-points: dueño borra" on storage.objects for delete
  using (bucket_id = 'safe-points' and (storage.foldername(name))[1] = auth.uid()::text);
