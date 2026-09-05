-- Agregar "vegano" como tercera categoria (ademas de vegetariano y carne)
alter table public.productos drop constraint if exists productos_categoria_check;
alter table public.productos add constraint productos_categoria_check
  check (categoria is null or categoria in ('vegetariano','vegano','carne'));

alter table public.menu_items drop constraint if exists menu_items_categoria_check;
alter table public.menu_items add constraint menu_items_categoria_check
  check (categoria is null or categoria in ('vegetariano','vegano','carne'));
