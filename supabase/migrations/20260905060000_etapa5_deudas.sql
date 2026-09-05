-- Etapa 5: deudas y obligaciones (creditos, impuestos, servicios).
-- No exige datos completos: se puede anotar solo el nombre.

create table public.deudas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro' check (tipo in ('credito','impuesto','servicio','otro')),
  ambito text check (ambito in ('negocio','personal')),
  monto_total numeric(12,2),
  cuota_estimada numeric(12,2),
  cuotas_totales integer,
  cuotas_pagadas integer not null default 0,
  fecha_inicio date,
  periodicidad text not null default 'mensual',
  estado text not null default 'al_dia' check (estado in ('al_dia','atrasada','cancelada')),
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.deudas enable row level security;
create policy "Users manage own deudas" on public.deudas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger update_deudas_updated_at before update on public.deudas
  for each row execute function public.update_updated_at_column();

alter table public.gastos
  add column if not exists deuda_id uuid references public.deudas(id) on delete set null;
