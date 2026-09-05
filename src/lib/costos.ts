import { supabase } from '@/integrations/supabase/client';

// ─── Configuración de costos (una por usuario) ────────────────────────────────

export interface ConfigCostos {
  menores_pct: number;              // condimentos y menores, % sobre el costo directo
  fallback_productivo_pct: number;  // % del costo directo si no hay minutos cargados
  precio_hora_mano_obra: number;
  costo_energia_mensual: number | null; // gas + luz productivos por mes
  minutos_mes: number;              // 43200 = 30 días
  markup_default: number;           // % de ganancia para el precio sugerido
}

export const CONFIG_COSTOS_DEFAULT: ConfigCostos = {
  menores_pct: 5,
  fallback_productivo_pct: 30,
  precio_hora_mano_obra: 0,
  costo_energia_mensual: null,
  minutos_mes: 43200,
  markup_default: 60,
};

export async function cargarConfigCostos(userId: string): Promise<ConfigCostos> {
  const { data } = await supabase.from('config_costos').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return { ...CONFIG_COSTOS_DEFAULT };
  return {
    menores_pct: Number(data.menores_pct),
    fallback_productivo_pct: Number(data.fallback_productivo_pct),
    precio_hora_mano_obra: Number(data.precio_hora_mano_obra),
    costo_energia_mensual: data.costo_energia_mensual == null ? null : Number(data.costo_energia_mensual),
    minutos_mes: Number(data.minutos_mes),
    markup_default: Number(data.markup_default),
  };
}

export async function guardarConfigCostos(userId: string, cfg: ConfigCostos): Promise<void> {
  const { error } = await supabase.from('config_costos').upsert(
    { user_id: userId, ...cfg },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

// ─── Cálculo de costos en capas ──────────────────────────────────────────────

export interface ProductoParaCostos {
  precio_costo: number;            // ingredientes por unidad (de una producción o manual)
  costo_packaging: number | null;
  minutos_por_unidad: number | null;
  precio_venta: number;
}

export type NivelCosto = 'sin_calcular' | 'estimado' | 'preciso';

export interface DesgloseCostos {
  ingredientes: number;
  menores: number;
  packaging: number;
  costoDirecto: number;
  productivoExtra: number;
  productivoEsFallback: boolean;
  costoProductivo: number;
  precioVenta: number;
  margen: number | null;
  margenPct: number | null;
  precioSugerido: number | null;
  nivel: NivelCosto;
}

export function calcularCostos(p: ProductoParaCostos, cfg: ConfigCostos): DesgloseCostos {
  const ingredientes = Number(p.precio_costo) || 0;
  const packaging = Number(p.costo_packaging) || 0;
  const menores = ingredientes * (cfg.menores_pct / 100);
  const costoDirecto = ingredientes + menores + packaging;

  let productivoExtra = 0;
  let productivoEsFallback = false;
  const minutos = p.minutos_por_unidad != null ? Number(p.minutos_por_unidad) : null;
  if (minutos != null && minutos > 0) {
    const energiaPorMin = cfg.costo_energia_mensual && cfg.minutos_mes > 0
      ? cfg.costo_energia_mensual / cfg.minutos_mes
      : 0;
    const manoObraPorMin = cfg.precio_hora_mano_obra / 60;
    productivoExtra = minutos * (energiaPorMin + manoObraPorMin);
  } else if (costoDirecto > 0) {
    productivoExtra = costoDirecto * (cfg.fallback_productivo_pct / 100);
    productivoEsFallback = true;
  }
  const costoProductivo = costoDirecto + productivoExtra;

  const precioVenta = Number(p.precio_venta) || 0;
  const margen = precioVenta > 0 && costoProductivo > 0 ? precioVenta - costoProductivo : null;
  const margenPct = margen != null && precioVenta > 0 ? (margen / precioVenta) * 100 : null;
  const precioSugerido = costoProductivo > 0
    ? Math.round(costoProductivo * (1 + cfg.markup_default / 100))
    : null;

  let nivel: NivelCosto = 'sin_calcular';
  if (ingredientes > 0) {
    nivel = (minutos != null && minutos > 0) ? 'preciso' : 'estimado';
  }

  return {
    ingredientes, menores, packaging, costoDirecto,
    productivoExtra, productivoEsFallback, costoProductivo,
    precioVenta, margen, margenPct, precioSugerido, nivel,
  };
}

export const LABEL_NIVEL_COSTO: Record<NivelCosto, string> = {
  sin_calcular: 'Sin calcular',
  estimado: 'Estimado',
  preciso: 'Preciso',
};
