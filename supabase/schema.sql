-- ============================================================================
-- Sismos Lima — Esquema Supabase (Fase 2: backend + roles)
-- Ejecutar en: Supabase Studio -> SQL Editor -> New query -> pegar -> Run.
--
-- Modelo: el CIUDADANO no necesita cuenta (usa la app anónimamente y lee el
-- contenido público). Solo los ADMINISTRADORES inician sesión (OTP por correo)
-- para gestionar el contenido de SU distrito. RLS protege todo a nivel de fila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Perfiles y roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'ciudadano'
             check (role in ('ciudadano','admin','autoridad')),
  district   text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2) Contenido por distrito (editable por el admin del distrito)
-- ---------------------------------------------------------------------------
create table if not exists public.shelters (            -- albergues
  id         uuid primary key default gen_random_uuid(),
  district   text not null,
  name       text not null,
  meta       text,
  lat        double precision,
  lon        double precision,
  active     boolean not null default true,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.emergency_contacts (  -- directorio
  id         uuid primary key default gen_random_uuid(),
  district   text not null,
  name       text not null,
  phone      text not null,
  meta       text,
  critical   boolean not null default false,
  scope      text not null default 'local' check (scope in ('nacional','local')),
  active     boolean not null default true,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.evacuation_points (   -- puntos de encuentro
  id           uuid primary key default gen_random_uuid(),
  district     text not null,
  name         text not null,
  lat          double precision,
  lon          double precision,
  instructions text,
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3) Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.shelters            enable row level security;
alter table public.emergency_contacts  enable row level security;
alter table public.evacuation_points   enable row level security;

-- ¿El usuario actual es admin del distrito d?
create or replace function public.is_admin_of(d text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.district = d
  );
$$;

-- profiles: cada quien ve/edita SOLO su propio perfil
drop policy if exists "perfil propio: leer" on public.profiles;
create policy "perfil propio: leer"
  on public.profiles for select using (id = auth.uid());

drop policy if exists "perfil propio: actualizar" on public.profiles;
create policy "perfil propio: actualizar"
  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Evitar que alguien se auto-ascienda a admin desde el cliente.
-- El rol solo cambia vía SQL del dueño del proyecto (service_role salta RLS/trigger).
create or replace function public.protect_role()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    new.role := old.role;   -- ignora cualquier cambio de rol hecho por el cliente
  end if;
  return new;
end; $$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- Contenido: lectura PÚBLICA de lo activo (anon); escritura SOLO admin del distrito
drop policy if exists "shelters: lectura pública" on public.shelters;
create policy "shelters: lectura pública"
  on public.shelters for select using (active = true);
drop policy if exists "shelters: admin escribe" on public.shelters;
create policy "shelters: admin escribe"
  on public.shelters for all
  using (public.is_admin_of(district)) with check (public.is_admin_of(district));

drop policy if exists "contacts: lectura pública" on public.emergency_contacts;
create policy "contacts: lectura pública"
  on public.emergency_contacts for select using (active = true);
drop policy if exists "contacts: admin escribe" on public.emergency_contacts;
create policy "contacts: admin escribe"
  on public.emergency_contacts for all
  using (public.is_admin_of(district)) with check (public.is_admin_of(district));

drop policy if exists "evac: lectura pública" on public.evacuation_points;
create policy "evac: lectura pública"
  on public.evacuation_points for select using (active = true);
drop policy if exists "evac: admin escribe" on public.evacuation_points;
create policy "evac: admin escribe"
  on public.evacuation_points for all
  using (public.is_admin_of(district)) with check (public.is_admin_of(district));

-- ---------------------------------------------------------------------------
-- 4) Semilla (San Isidro) — coincide con el contenido actual de la app
-- ---------------------------------------------------------------------------
insert into public.emergency_contacts (district,name,phone,meta,critical,scope,sort) values
  ('San Isidro','Bomberos','116','116 · gratis',true,'nacional',1),
  ('San Isidro','SAMU','106','106',false,'nacional',2),
  ('San Isidro','Serenazgo San Isidro','015139000','(01) 513 9000',false,'local',3),
  ('San Isidro','Cruz Roja Peruana','012660481','(01) 266 0481',false,'nacional',4)
on conflict do nothing;

insert into public.shelters (district,name,meta,sort) values
  ('San Isidro','Parque El Olivar','340 m · a 4 min caminando',1),
  ('San Isidro','Estadio Niño Héroe','1.2 km',2),
  ('San Isidro','Colegio San Agustín','1.8 km',3)
on conflict do nothing;

insert into public.evacuation_points (district,name,lat,lon,instructions) values
  ('San Isidro','Parque El Olivar',-12.0975,-77.0364,'Baja por Av. Los Incas y cruza a la derecha en el parque.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5) Cómo nombrar un administrador (ejecutar DESPUÉS de que la persona
--    haya iniciado sesión al menos una vez, para que exista su fila en auth.users):
--
--    update public.profiles
--      set role = 'admin', district = 'San Isidro', full_name = 'Nombre Apellido'
--      where id = (select id from auth.users where email = 'admin@ejemplo.com');
-- ---------------------------------------------------------------------------
