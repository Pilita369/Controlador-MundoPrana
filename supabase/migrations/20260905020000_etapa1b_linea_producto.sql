-- Agrupacion de productos elaborados para las pestanas de la pantalla Productos:
-- congelados (carta congelados) / menu_dia / reventa (te, miel, etc.) / otros.
alter table public.productos
  add column if not exists linea text not null default 'otros'
    check (linea in ('congelados','menu_dia','reventa','otros'));
