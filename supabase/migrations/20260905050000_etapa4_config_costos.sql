-- Etapa 4: configuracion de costos (un registro por usuario) + campos por producto.
-- Capas: costo directo (ingredientes + menores % + packaging) -> costo productivo
-- (+ energia y mano de obra prorrateadas por minutos, o un % de respaldo del directo).
-- Los gastos de estructura NO van aca: ya estan en la tabla gastos.

create table public.config_costos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  menores_pct numeric(6,2) not null default 5,
  fallback_productivo_pct numeric(6,2) not null default 30,
  precio_hora_mano_obra numeric(12,2) not null default 0,
  costo_energia_mensual numeric(12,2),
  minutos_mes integer not null default 43200,
  markup_default numeric(6,2) not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.config_costos enable row level security;
create policy "Users manage own config_costos" on public.config_costos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger update_config_costos_updated_at before update on public.config_costos
  for each row execute function public.update_updated_at_column();

alter table public.productos
  add column if not exists minutos_por_unidad numeric(10,2),
  add column if not exists costo_packaging numeric(12,2);
