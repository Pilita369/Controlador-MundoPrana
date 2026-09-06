import { supabase } from '@/integrations/supabase/client';
import { actualizarPrecioCosto } from '@/lib/precios';

export interface CompraResumen {
  id: string;
  fecha: string;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
  proveedor: string | null;
}

export async function cargarCompras(productoId: string, limite = 8): Promise<CompraResumen[]> {
  const { data } = await supabase.from('compras')
    .select('id, fecha, cantidad, precio_unitario, precio_total, proveedor')
    .eq('producto_id', productoId)
    .order('fecha', { ascending: false })
    .limit(limite);
  return (data as CompraResumen[]) ?? [];
}

// Registra una compra de materia prima: sube el stock, actualiza el costo
// (queda en precios_historial) y opcionalmente crea un gasto del negocio.
export async function registrarCompra(params: {
  userId: string;
  productoId: string;
  productoNombre: string;
  fecha: string;
  cantidad: number;
  precioUnitario: number;
  proveedor?: string;
  comoGasto: boolean;
  medioPago: string;
}): Promise<void> {
  const { userId, productoId, productoNombre, fecha, cantidad, precioUnitario, proveedor, comoGasto, medioPago } = params;
  const precioTotal = Math.round(cantidad * precioUnitario * 100) / 100;

  // 1. costo del ingrediente (+ historial de precios)
  await actualizarPrecioCosto(userId, productoId, precioUnitario, 'ticket', proveedor ? `Compra a ${proveedor}` : undefined);

  // 2. subir stock
  const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', productoId).single();
  if (prod) {
    await supabase.from('productos').update({ stock_actual: Number(prod.stock_actual) + cantidad }).eq('id', productoId);
  }
  await supabase.from('stock_movimientos').insert({
    user_id: userId, producto_id: productoId, tipo: 'compra', cantidad,
    notas: `Compra${proveedor ? ` - ${proveedor}` : ''}`,
  });

  // 3. gasto opcional
  let gastoId: string | null = null;
  if (comoGasto) {
    let categoriaId: string | null = null;
    const { data: cat } = await supabase.from('categorias_gasto').select('id').match({ user_id: userId, tipo: 'negocio', nombre: 'Materia prima' }).maybeSingle();
    if (cat) categoriaId = cat.id;
    else {
      const { data: nueva } = await supabase.from('categorias_gasto').insert({ user_id: userId, tipo: 'negocio', nombre: 'Materia prima' }).select('id').single();
      categoriaId = nueva?.id ?? null;
    }
    const { data: g } = await supabase.from('gastos').insert({
      user_id: userId, fecha, descripcion: `Compra ${productoNombre}`, monto: precioTotal,
      tipo: 'negocio', medio_pago: medioPago, categoria_id: categoriaId,
    }).select('id').single();
    gastoId = g?.id ?? null;
  }

  // 4. registro de la compra
  await supabase.from('compras').insert({
    user_id: userId, producto_id: productoId, fecha, cantidad,
    precio_unitario: precioUnitario, precio_total: precioTotal,
    proveedor: proveedor || null, gasto_id: gastoId,
  });
}
