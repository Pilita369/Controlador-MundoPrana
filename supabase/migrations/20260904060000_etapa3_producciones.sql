-- Etapa 3: produccion por lote (registra, descuenta materia prima cuando hay
-- datos suficientes, aumenta stock del producto, calcula costo estimado, y
-- guarda el rendimiento historico). No exige receta previa ni datos completos.

create table public.producciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  fecha date not null default current_date,
  cantidad_obtenida numeric(12,3) not null check (cantidad_obtenida > 0),
  costo_total numeric(12,2),
  costo_unitario numeric(12,2),
  nivel_precision text not null default 'sin_calcular' check (nivel_precision in ('sin_calcular','estimado','preciso')),
  notas text,
  created_at timestamptz not null default now()
);
alter table public.producciones enable row level security;
create policy "Users manage own producciones" on public.producciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index producciones_producto_id_idx on public.producciones(producto_id, fecha desc);

create table public.produccion_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  produccion_id uuid not null references public.producciones(id) on delete cascade,
  ingrediente_id uuid references public.productos(id) on delete set null,
  nombre_libre text,
  cantidad numeric(12,3),
  unidad text,
  costo_calc numeric(12,2),
  created_at timestamptz not null default now()
);
alter table public.produccion_items enable row level security;
create policy "Users manage own produccion_items" on public.produccion_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index produccion_items_produccion_id_idx on public.produccion_items(produccion_id);
