-- Tabla pedidos: agrupa múltiples items de venta con descuento opcional
CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente TEXT,
  medio_cobro TEXT NOT NULL DEFAULT 'efectivo',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  descuento_monto NUMERIC NOT NULL DEFAULT 0,
  descuento_porcentaje NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pedidos"
  ON public.pedidos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Agregar columna pedido_id a ventas (nullable para mantener compatibilidad con ventas existentes)
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE;
