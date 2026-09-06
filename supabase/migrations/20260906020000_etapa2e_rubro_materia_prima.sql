-- Rubro de la materia prima, para agrupar (sobre todo en la alerta de stock bajo)
alter table public.productos
  add column if not exists rubro text
    check (rubro is null or rubro in ('carnes','verduras','lacteos','granel','otros'));
