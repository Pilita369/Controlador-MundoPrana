import { supabase } from '@/integrations/supabase/client';
import { sinAcentos, normalizarNombre, parsePrecioAR } from '@/lib/importParser';
import { actualizarPrecioCosto } from '@/lib/precios';

// ─── Unidades: alias y conversiones conocidas ─────────────────────────────────

const ALIAS_UNIDAD: Record<string, string> = {
  kilo: 'kg', kilos: 'kg', kg: 'kg', kgs: 'kg',
  gramo: 'g', gramos: 'g', gr: 'g', grs: 'g', g: 'g',
  litro: 'litro', litros: 'litro', lt: 'litro', l: 'litro',
  mililitro: 'ml', mililitros: 'ml', ml: 'ml',
  docena: 'docena', docenas: 'docena',
  unidad: 'unidad', unidades: 'unidad', un: 'unidad', u: 'unidad',
  maple: 'maple', maples: 'maple',
  paquete: 'paquete', paquetes: 'paquete',
  porcion: 'porción', porciones: 'porción', 'porción': 'porción',
};

export function normalizarUnidad(u?: string | null): string | undefined {
  if (!u) return undefined;
  const limpio = sinAcentos(u).replace(/\.$/, '').trim();
  return ALIAS_UNIDAD[limpio] ?? limpio;
}

// pares [unidad grande, unidad chica, cuantas chicas hay en 1 grande]
const PARES_METRICOS: [string, string, number][] = [
  ['kg', 'g', 1000],
  ['litro', 'ml', 1000],
  ['docena', 'unidad', 12],
];

// Convierte una cantidad dicha en `unidadDicha` a la unidad de stock del producto.
// Devuelve null si no hay forma confiable de convertir (no bloquea: solo no se puede calcular ese item).
export function convertirCantidad(
  cantidad: number,
  unidadDicha: string | undefined,
  unidadStock: string,
  unidadUso?: string | null,
  equivalenciaUso?: number | null,
): number | null {
  const uD = normalizarUnidad(unidadDicha);
  const uT = normalizarUnidad(unidadStock);
  if (!uD || uD === uT) return cantidad;

  for (const [grande, chica, factor] of PARES_METRICOS) {
    if (uD === chica && uT === grande) return cantidad / factor;
    if (uD === grande && uT === chica) return cantidad * factor;
  }
  if (unidadUso && equivalenciaUso && uD === normalizarUnidad(unidadUso)) {
    return cantidad / equivalenciaUso;
  }
  return null;
}

// ─── Parseo de texto libre de ingredientes ────────────────────────────────────
// "Usé 2kg de lentejas, 700g de arroz, 8 huevos y verduras"

export interface IngredienteTexto {
  nombre: string;
  cantidad?: number;
  unidad?: string;
}

const VERBO_INICIAL = /^\s*(us[eé]|utilic[eé]|gast[eé]|usamos|utilizamos|lleva|llev[oó])\s+/i;
const UNIDADES_RE = 'kilos?|kgs?|gramos?|grs?|g|litros?|lts?|l|mililitros?|ml|docenas?|maples?|paquetes?|porciones?|unidades?|un|u';
const CANTIDAD_RE = new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_RE})?\\.?\\s*(?:de\\s+)?(.+)$`, 'i');

// Cantidades habladas en fracciones comunes, antes de buscar numeros
function resolverFracciones(s: string): string {
  return s
    .replace(/\bmedi[oa]\b/gi, '0.5')
    .replace(/\bun\s+cuarto\b/gi, '0.25')
    .replace(/\btres\s+cuartos?\b/gi, '0.75')
    .replace(/\bun\s+tercio\b/gi, '0.33');
}

export function parseIngredientesTexto(texto: string): IngredienteTexto[] {
  const limpio = resolverFracciones(texto.replace(VERBO_INICIAL, ''));
  const segmentos = limpio.split(/,|\by\b|\n/).map(s => s.trim()).filter(Boolean);
  const filas: IngredienteTexto[] = [];
  for (const seg of segmentos) {
    const m = seg.match(CANTIDAD_RE);
    if (m) {
      const cantidad = parsePrecioAR(m[1]) ?? parseFloat(m[1].replace(',', '.'));
      const unidad = m[2] ? normalizarUnidad(m[2]) : undefined;
      const nombre = m[3].trim();
      if (nombre) filas.push({ nombre, cantidad: Number.isFinite(cantidad) ? cantidad : undefined, unidad });
    } else if (seg) {
      filas.push({ nombre: seg });
    }
  }
  return filas;
}

// ─── Matching contra productos existentes ─────────────────────────────────────

export function buscarProductoPorNombre<T extends { id: string; nombre: string }>(nombre: string, productos: T[]): T | undefined {
  const n = normalizarNombre(nombre);
  const exacto = productos.find(p => normalizarNombre(p.nombre) === n);
  if (exacto) return exacto;
  const candidatos = productos.filter(p => {
    const pn = normalizarNombre(p.nombre);
    return pn.includes(n) || n.includes(pn);
  });
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

// ─── Costo de un item ──────────────────────────────────────────────────────────

export interface ProductoParaCosto {
  unidad_medida: string;
  unidad_uso: string | null;
  equivalencia_uso: number | null;
  precio_costo: number;
}

export function calcularCostoItem(
  cantidad: number | undefined,
  unidad: string | undefined,
  producto: ProductoParaCosto,
): { cantidadConvertida: number | null; costo: number | null } {
  if (cantidad === undefined) return { cantidadConvertida: null, costo: null };
  const unidadEfectiva = unidad ?? producto.unidad_uso ?? producto.unidad_medida;
  const conv = convertirCantidad(cantidad, unidadEfectiva, producto.unidad_medida, producto.unidad_uso, producto.equivalencia_uso);
  if (conv === null) return { cantidadConvertida: null, costo: null };
  const costo = producto.precio_costo > 0 ? Math.round(conv * producto.precio_costo * 100) / 100 : null;
  return { cantidadConvertida: conv, costo };
}

export type NivelPrecision = 'sin_calcular' | 'estimado' | 'preciso';

export function calcularNivelPrecision(items: { costo: number | null }[]): NivelPrecision {
  if (items.length === 0) return 'sin_calcular';
  const conCosto = items.filter(i => i.costo != null && i.costo > 0).length;
  if (conCosto === 0) return 'sin_calcular';
  return conCosto === items.length ? 'preciso' : 'estimado';
}

export const LABEL_PRECISION: Record<NivelPrecision, string> = {
  sin_calcular: 'Sin calcular',
  estimado: 'Estimado',
  preciso: 'Preciso',
};

// ─── Guardar la producción ─────────────────────────────────────────────────────

export interface ItemAGuardar {
  nombre: string;
  cantidad?: number;
  unidad?: string;
  productoId?: string;
  cantidadConvertida?: number | null;
  costo?: number | null;
}

export async function registrarProduccion(params: {
  userId: string;
  productoId: string;
  productoNombre: string;
  fecha: string;
  cantidadObtenida: number;
  items: ItemAGuardar[];
  notas?: string;
  actualizarCostoProducto: boolean;
}): Promise<{ nivelPrecision: NivelPrecision; costoUnitario: number | null }> {
  const { userId, productoId, productoNombre, fecha, cantidadObtenida, items, notas, actualizarCostoProducto } = params;

  const costoTotal = items.reduce((s, i) => s + (i.costo ?? 0), 0);
  const nivelPrecision = calcularNivelPrecision(items.map(i => ({ costo: i.costo ?? null })));
  const costoUnitario = costoTotal > 0 ? Math.round((costoTotal / cantidadObtenida) * 100) / 100 : null;

  const { data: produccion, error: errProd } = await supabase.from('producciones').insert({
    user_id: userId,
    producto_id: productoId,
    fecha,
    cantidad_obtenida: cantidadObtenida,
    costo_total: costoTotal > 0 ? costoTotal : null,
    costo_unitario: costoUnitario,
    nivel_precision: nivelPrecision,
    notas: notas || null,
  }).select('id').single();
  if (errProd || !produccion) throw errProd ?? new Error('No se pudo registrar la producción');

  if (items.length > 0) {
    await supabase.from('produccion_items').insert(items.map(i => ({
      user_id: userId,
      produccion_id: produccion.id,
      ingrediente_id: i.productoId ?? null,
      nombre_libre: i.productoId ? null : i.nombre,
      cantidad: i.cantidad ?? null,
      unidad: i.unidad ?? null,
      costo_calc: i.costo ?? null,
    })));
  }

  // Descontar materia prima / bases usadas (solo donde se pudo convertir la cantidad)
  for (const item of items) {
    if (!item.productoId || item.cantidadConvertida == null) continue;
    const { data: ing } = await supabase.from('productos').select('stock_actual').eq('id', item.productoId).single();
    if (!ing) continue;
    await supabase.from('productos').update({ stock_actual: Number(ing.stock_actual) - item.cantidadConvertida }).eq('id', item.productoId);
    await supabase.from('stock_movimientos').insert({
      user_id: userId,
      producto_id: item.productoId,
      tipo: 'produccion',
      cantidad: -item.cantidadConvertida,
      notas: `Producción de ${productoNombre}`,
    });
  }

  // Sumar stock del producto elaborado
  const { data: destino } = await supabase.from('productos').select('stock_actual').eq('id', productoId).single();
  if (destino) {
    await supabase.from('productos').update({ stock_actual: Number(destino.stock_actual) + cantidadObtenida }).eq('id', productoId);
  }
  await supabase.from('stock_movimientos').insert({
    user_id: userId,
    producto_id: productoId,
    tipo: 'produccion',
    cantidad: cantidadObtenida,
    notas: 'Producción registrada',
  });

  if (actualizarCostoProducto && costoUnitario != null) {
    await actualizarPrecioCosto(userId, productoId, costoUnitario, 'produccion');
  }

  return { nivelPrecision, costoUnitario };
}

// ─── Historial de producciones ─────────────────────────────────────────────────

export interface ProduccionResumen {
  id: string;
  producto_id: string;
  fecha: string;
  cantidad_obtenida: number;
  costo_total: number | null;
  costo_unitario: number | null;
  nivel_precision: string;
  notas: string | null;
  productos: { nombre: string; unidad_medida: string } | null;
}

export async function cargarProducciones(userId: string, productoId?: string): Promise<ProduccionResumen[]> {
  let q = supabase.from('producciones').select('*, productos(nombre, unidad_medida)').eq('user_id', userId).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (productoId) q = q.eq('producto_id', productoId);
  const { data } = await q;
  return (data as any) ?? [];
}

export interface ItemGuardadoDb {
  id: string;
  ingrediente_id: string | null;
  nombre_libre: string | null;
  cantidad: number | null;
  unidad: string | null;
}

export async function cargarItemsProduccion(produccionId: string): Promise<ItemGuardadoDb[]> {
  const { data } = await supabase.from('produccion_items').select('id, ingrediente_id, nombre_libre, cantidad, unidad').eq('produccion_id', produccionId);
  return (data as any) ?? [];
}
