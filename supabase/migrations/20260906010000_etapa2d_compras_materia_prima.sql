-- Compras / ingresos de materia prima: cantidad, precio y fecha por cada compra.
-- Al registrar una compra: sube el stock, actualiza el costo (queda en precios_historial)
-- y opcionalmente crea un gasto del negocio.

alter table public.stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table public.stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('produccion','venta','retiro_duena','ajuste','perdida','consumo_interno','otro','compra'));

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  fecha date not null default current_date,
  cantidad numeric(12,3) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  precio_total numeric(12,2) not null,
  proveedor text,
  gasto_id uuid references public.gastos(id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);
alter table public.compras enable row level security;
create policy "Users manage own compras" on public.compras
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index compras_producto_id_idx on public.compras(producto_id, fecha desc);
