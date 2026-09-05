-- Renombrar el grupo "otros" a "carta_fija" (carta fija / a la carta, disponible siempre)
alter table public.productos drop constraint if exists productos_linea_check;
update public.productos set linea = 'carta_fija'
  where linea = 'otros' or linea not in ('congelados','menu_dia','reventa','carta_fija');
alter table public.productos alter column linea set default 'carta_fija';
alter table public.productos add constraint productos_linea_check
  check (linea in ('congelados','menu_dia','reventa','carta_fija'));
