import { supabase } from '@/integrations/supabase/client';

export type FuentePrecio = 'manual' | 'texto' | 'ticket' | 'voz' | 'import' | 'produccion';

// Actualiza el costo de un producto y deja el valor anterior en precios_historial.
// No hace nada si el precio no cambió.
export async function actualizarPrecioCosto(
  userId: string,
  productoId: string,
  nuevoPrecio: number,
  fuente: FuentePrecio,
  notas?: string,
): Promise<{ cambiado: boolean }> {
  const { data: actual } = await supabase.from('productos').select('precio_costo').eq('id', productoId).single();
  if (actual && Number(actual.precio_costo) === Number(nuevoPrecio)) return { cambiado: false };

  const { error } = await supabase.from('productos').update({ precio_costo: nuevoPrecio }).eq('id', productoId);
  if (error) throw error;

  await supabase.from('precios_historial').insert({
    user_id: userId,
    producto_id: productoId,
    precio_costo: nuevoPrecio,
    fuente,
    notas: notas ?? null,
  });
  return { cambiado: true };
}

export interface EntradaHistorial {
  id: string;
  precio_costo: number;
  fuente: string;
  created_at: string;
}

export async function cargarHistorialPrecio(productoId: string, limite = 5): Promise<EntradaHistorial[]> {
  const { data } = await supabase
    .from('precios_historial')
    .select('id, precio_costo, fuente, created_at')
    .eq('producto_id', productoId)
    .order('created_at', { ascending: false })
    .limit(limite);
  return (data as EntradaHistorial[]) ?? [];
}
