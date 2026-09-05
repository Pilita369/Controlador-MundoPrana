-- Clientes (liviano) + distincion esporadico/mensualidad en pedidos.
-- La mensualidad es un ingreso cobrado por adelantado (no esta atado a productos/stock).

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  es_mensual boolean not null default false,
  monto_mensual numeric(12,2),
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clientes enable row level security;
create policy "Users manage own clientes" on public.clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger update_clientes_updated_at before update on public.clientes
  for each row execute function public.update_updated_at_column();

alter table public.pedidos
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null,
  add column if not exists tipo_ingreso text not null default 'esporadico'
    check (tipo_ingreso in ('esporadico','mensualidad')),
  add column if not exists mes_mensualidad date;
