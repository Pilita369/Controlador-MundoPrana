
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.categorias_gasto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('negocio', 'personal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias_gasto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categorias" ON public.categorias_gasto FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.productos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fresco', 'congelado')),
  precio_costo NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_ganancia NUMERIC(5,2),
  precio_venta_manual BOOLEAN NOT NULL DEFAULT true,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  unidad_medida TEXT NOT NULL DEFAULT 'unidad',
  alerta_stock_bajo INTEGER NOT NULL DEFAULT 5,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own productos" ON public.productos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.stock_movimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('produccion', 'venta', 'retiro_duena', 'ajuste')),
  cantidad INTEGER NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own stock_movimientos" ON public.stock_movimientos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ventas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cantidad INTEGER NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  medio_cobro TEXT NOT NULL CHECK (medio_cobro IN ('efectivo', 'transferencia', 'mercadopago')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ventas" ON public.ventas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.gastos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  categoria_id UUID REFERENCES public.categorias_gasto(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('negocio', 'personal')),
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo', 'transferencia', 'tarjeta')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gastos" ON public.gastos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sueldo_retiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL CHECK (tipo IN ('dinero', 'especie')),
  monto NUMERIC(12,2) NOT NULL,
  medio_pago TEXT CHECK (medio_pago IN ('efectivo', 'transferencia', 'tarjeta')),
  producto_id UUID REFERENCES public.productos(id),
  cantidad_producto INTEGER,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sueldo_retiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sueldo_retiros" ON public.sueldo_retiros FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ajustes_usuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_negocio TEXT NOT NULL DEFAULT 'Mundo Prana',
  meta_sueldo_mensual NUMERIC(12,2) NOT NULL DEFAULT 300000,
  datos_iniciales_cargados BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ajustes_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ajustes" ON public.ajustes_usuario FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_ajustes_updated_at BEFORE UPDATE ON public.ajustes_usuario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
