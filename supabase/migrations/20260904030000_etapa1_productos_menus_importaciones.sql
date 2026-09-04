-- Etapa 1: productos (clase/categoria/decimales), stock_movimientos (mas tipos),
-- menus y cartas, staging de importacion (la IA no escribe directo en tablas reales).
-- Aplicada al proyecto biimvbzbwzydhpawttaa ("Mundo Prana") el 2026-09-04.

-- 1. funcion updated_at (idempotente, igual al resto del proyecto)
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- 2. productos: stock decimal + clase + categoria (dieta)
alter table public.productos
  alter column stock_actual type numeric(12,3) using stock_actual::numeric,
  alter column alerta_stock_bajo type numeric(12,3) using alerta_stock_bajo::numeric;

alter table public.productos
  add column if not exists clase text not null default 'elaborado'
    check (clase in ('materia_prima','base','elaborado')),
  add column if not exists categoria text
    check (categoria in ('vegetariano','carne'));

-- backfill clase desde el flag anterior (se mantiene es_materia_prima por compat con el codigo actual)
update public.productos set clase = 'materia_prima' where es_materia_prima = true;

-- 3. stock_movimientos: mas tipos de movimiento
alter table public.stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table public.stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('produccion','venta','retiro_duena','ajuste','perdida','consumo_interno','otro'));

-- 4. menus / cartas
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('mediodia','congelados')),
  mes date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menus enable row level security;
create policy "Users manage own menus" on public.menus
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger update_menus_updated_at before update on public.menus
  for each row execute function public.update_updated_at_column();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  fecha date,
  dia_semana smallint check (dia_semana between 0 and 6),
  producto_id uuid references public.productos(id) on delete set null,
  nombre_plato text not null,
  categoria text check (categoria in ('vegetariano','carne')),
  precio numeric(12,2),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;
create policy "Users manage own menu_items" on public.menu_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index menu_items_menu_id_idx on public.menu_items(menu_id);
create index menu_items_user_id_idx on public.menu_items(user_id);

-- 5. staging de importacion
create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('productos','menu','precios','produccion','stock')),
  origen text not null check (origen in ('texto','csv','excel','imagen','pdf','voz')),
  estado text not null default 'preview' check (estado in ('preview','confirmado','descartado')),
  payload jsonb not null default '{}'::jsonb,
  crudo text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.importaciones enable row level security;
create policy "Users manage own importaciones" on public.importaciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger update_importaciones_updated_at before update on public.importaciones
  for each row execute function public.update_updated_at_column();
