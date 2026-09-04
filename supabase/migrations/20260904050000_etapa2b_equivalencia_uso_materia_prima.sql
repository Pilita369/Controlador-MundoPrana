-- Conversion opcional de unidad de compra/stock a unidad de uso en produccion
-- Ej: unidad_medida = 'maple' (30 huevos), unidad_uso = 'unidad', equivalencia_uso = 30
alter table public.productos
  add column if not exists unidad_uso text,
  add column if not exists equivalencia_uso numeric(12,3) check (equivalencia_uso is null or equivalencia_uso > 0);
