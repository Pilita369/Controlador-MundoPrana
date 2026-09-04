-- Etapa 2: historial de precios de costo (no se pisa el valor anterior)
create table public.precios_historial (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  precio_costo numeric(12,2) not null,
  fuente text not null default 'manual' check (fuente in ('manual','texto','ticket','voz','import','produccion')),
  notas text,
  created_at timestamptz not null default now()
);
alter table public.precios_historial enable row level security;
create policy "Users manage own precios_historial" on public.precios_historial
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index precios_historial_producto_id_idx on public.precios_historial(producto_id, created_at desc);
