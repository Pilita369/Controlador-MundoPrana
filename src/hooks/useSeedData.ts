import { supabase } from '@/integrations/supabase/client';

export async function seedInitialData(userId: string) {
  // Check if already seeded
  const { data: ajustes } = await supabase.from('ajustes_usuario').select('datos_iniciales_cargados').eq('user_id', userId).single();
  if (ajustes?.datos_iniciales_cargados) return;

  // Create settings
  await supabase.from('ajustes_usuario').upsert({
    user_id: userId,
    nombre_negocio: 'Mundo Prana',
    meta_sueldo_mensual: 300000,
    datos_iniciales_cargados: true,
  });

  // Create categories
  const categoriasNegocio = ['Ingredientes', 'Packaging', 'Servicios', 'Alquiler', 'Transporte', 'Otros'];
  const categoriasPersonal = ['Alimentación', 'Transporte', 'Salud', 'Vivienda', 'Otros'];
  
  const catInserts = [
    ...categoriasNegocio.map(nombre => ({ user_id: userId, nombre, tipo: 'negocio' as const })),
    ...categoriasPersonal.map(nombre => ({ user_id: userId, nombre, tipo: 'personal' as const })),
  ];
  const { data: cats } = await supabase.from('categorias_gasto').insert(catInserts).select();

  // Create products
  const productos = [
    { nombre: 'Tarta de verduras', tipo: 'fresco' as const, precio_costo: 1800, precio_venta: 3200, stock_actual: 12, unidad_medida: 'unidad' },
    { nombre: 'Bowl proteico', tipo: 'fresco' as const, precio_costo: 2200, precio_venta: 3800, stock_actual: 8, unidad_medida: 'porción' },
    { nombre: 'Milanesas de soja (x4)', tipo: 'congelado' as const, precio_costo: 1500, precio_venta: 2800, stock_actual: 15, unidad_medida: 'paquete' },
    { nombre: 'Guiso de lentejas', tipo: 'congelado' as const, precio_costo: 1600, precio_venta: 2900, stock_actual: 10, unidad_medida: 'porción' },
    { nombre: 'Wraps integrales (x2)', tipo: 'fresco' as const, precio_costo: 2000, precio_venta: 3500, stock_actual: 6, unidad_medida: 'paquete' },
    { nombre: 'Budín de avena', tipo: 'fresco' as const, precio_costo: 1200, precio_venta: 2200, stock_actual: 9, unidad_medida: 'unidad' },
  ];

  const { data: prods } = await supabase.from('productos').insert(
    productos.map(p => ({ ...p, user_id: userId, precio_venta_manual: true, alerta_stock_bajo: 5, activo: true }))
  ).select();

  if (!prods || !cats) return;

  const today = new Date();
  const mm = today.getMonth();
  const yyyy = today.getFullYear();
  const d = (day: number) => `${yyyy}-${String(mm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Ventas
  const ventas = [
    { producto_id: prods[0].id, fecha: d(3), cantidad: 2, precio_unitario: 3200, total: 6400, medio_cobro: 'efectivo' },
    { producto_id: prods[1].id, fecha: d(5), cantidad: 1, precio_unitario: 3800, total: 3800, medio_cobro: 'transferencia' },
    { producto_id: prods[2].id, fecha: d(8), cantidad: 3, precio_unitario: 2800, total: 8400, medio_cobro: 'mercadopago' },
    { producto_id: prods[3].id, fecha: d(12), cantidad: 2, precio_unitario: 2900, total: 5800, medio_cobro: 'efectivo' },
    { producto_id: prods[4].id, fecha: d(15), cantidad: 1, precio_unitario: 3500, total: 3500, medio_cobro: 'transferencia' },
  ];
  await supabase.from('ventas').insert(ventas.map(v => ({ ...v, user_id: userId })));

  // Gastos negocio
  const catIngredientes = cats.find(c => c.nombre === 'Ingredientes' && c.tipo === 'negocio');
  const catPackaging = cats.find(c => c.nombre === 'Packaging' && c.tipo === 'negocio');
  const catServicios = cats.find(c => c.nombre === 'Servicios' && c.tipo === 'negocio');
  const catAlimentacion = cats.find(c => c.nombre === 'Alimentación' && c.tipo === 'personal');
  const catTransPersonal = cats.find(c => c.nombre === 'Transporte' && c.tipo === 'personal');

  await supabase.from('gastos').insert([
    { user_id: userId, fecha: d(2), descripcion: 'Verduras orgánicas', monto: 8500, categoria_id: catIngredientes?.id, tipo: 'negocio', medio_pago: 'efectivo' },
    { user_id: userId, fecha: d(4), descripcion: 'Envases biodegradables', monto: 4200, categoria_id: catPackaging?.id, tipo: 'negocio', medio_pago: 'transferencia' },
    { user_id: userId, fecha: d(10), descripcion: 'Gas y electricidad', monto: 12000, categoria_id: catServicios?.id, tipo: 'negocio', medio_pago: 'tarjeta' },
    { user_id: userId, fecha: d(6), descripcion: 'Supermercado', monto: 15000, categoria_id: catAlimentacion?.id, tipo: 'personal', medio_pago: 'tarjeta' },
    { user_id: userId, fecha: d(9), descripcion: 'SUBE', monto: 3000, categoria_id: catTransPersonal?.id, tipo: 'personal', medio_pago: 'efectivo' },
  ]);

  // Sueldo retiros
  await supabase.from('sueldo_retiros').insert([
    { user_id: userId, fecha: d(7), tipo: 'dinero', monto: 50000, medio_pago: 'transferencia', notas: 'Retiro quincenal' },
    { user_id: userId, fecha: d(11), tipo: 'especie', monto: prods[0].precio_costo * 2, producto_id: prods[0].id, cantidad_producto: 2, notas: 'Tartas para casa' },
  ]);
}
