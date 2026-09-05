import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { cargarConfigCostos, calcularCostos, type ConfigCostos } from '@/lib/costos';

interface Resumen {
  ingresosEsporadicas: number;
  ingresosMensualidad: number;
  costoMercaderia: number;
  gastosNegocio: number;
  gastosNegocioDeuda: number;
  sueldo: number;
  gastosPersonales: number;
  compromisoDeudaMensual: number;
  ventasSinCosto: number;
}

const NADA: Resumen = {
  ingresosEsporadicas: 0, ingresosMensualidad: 0, costoMercaderia: 0, gastosNegocio: 0,
  gastosNegocioDeuda: 0, sueldo: 0, gastosPersonales: 0, compromisoDeudaMensual: 0, ventasSinCosto: 0,
};

function rangoMes(d: Date) {
  const y = d.getFullYear(), m = d.getMonth();
  const s = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const e = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`;
  return { s, e };
}

export default function Resultado() {
  const { user } = useAuth();
  const [mes, setMes] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [r, setR] = useState<Resumen>(NADA);
  const [cfg, setCfg] = useState<ConfigCostos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user, mes]);

  async function load() {
    setLoading(true);
    const { s, e } = rangoMes(mes);
    const [ventasRes, mensRes, gnegRes, gperRes, sueldoRes, config, deudasRes] = await Promise.all([
      supabase.from('ventas').select('cantidad, total, productos(precio_costo, costo_packaging, minutos_por_unidad, precio_venta)').eq('user_id', user!.id).gte('fecha', s).lte('fecha', e),
      supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'mensualidad').gte('fecha', s).lte('fecha', e),
      supabase.from('gastos').select('monto, deuda_id').eq('user_id', user!.id).eq('tipo', 'negocio').gte('fecha', s).lte('fecha', e),
      supabase.from('gastos').select('monto').eq('user_id', user!.id).eq('tipo', 'personal').gte('fecha', s).lte('fecha', e),
      supabase.from('sueldo_retiros').select('monto').eq('user_id', user!.id).gte('fecha', s).lte('fecha', e),
      cargarConfigCostos(user!.id),
      supabase.from('deudas').select('cuota_estimada, ambito').eq('user_id', user!.id).eq('activo', true),
    ]);
    setCfg(config);

    let costoMercaderia = 0, ventasSinCosto = 0;
    (ventasRes.data ?? []).forEach((v: any) => {
      const p = v.productos;
      if (!p || !Number(p.precio_costo)) { ventasSinCosto += 1; return; }
      const d = calcularCostos(p, config);
      costoMercaderia += d.costoProductivo * Number(v.cantidad || 0);
    });

    const gneg = gnegRes.data ?? [];
    setR({
      ingresosEsporadicas: (ventasRes.data ?? []).reduce((a: number, v: any) => a + Number(v.total), 0),
      ingresosMensualidad: (mensRes.data ?? []).reduce((a: number, v: any) => a + Number(v.total), 0),
      costoMercaderia,
      gastosNegocio: gneg.reduce((a: number, g: any) => a + Number(g.monto), 0),
      gastosNegocioDeuda: gneg.filter((g: any) => g.deuda_id).reduce((a: number, g: any) => a + Number(g.monto), 0),
      sueldo: (sueldoRes.data ?? []).reduce((a: number, x: any) => a + Number(x.monto), 0),
      gastosPersonales: (gperRes.data ?? []).reduce((a: number, x: any) => a + Number(x.monto), 0),
      compromisoDeudaMensual: (deudasRes.data ?? []).filter((d: any) => d.ambito !== 'personal').reduce((a: number, d: any) => a + Number(d.cuota_estimada || 0), 0),
      ventasSinCosto,
    });
    setLoading(false);
  }

  const ingresosTotales = r.ingresosEsporadicas + r.ingresosMensualidad;
  const margenBruto = ingresosTotales - r.costoMercaderia;
  const margenBrutoPct = ingresosTotales > 0 ? (margenBruto / ingresosTotales) * 100 : null;
  const resultadoOperativo = margenBruto - r.gastosNegocio;
  const resultadoFinal = resultadoOperativo - r.sueldo;

  const cubreGastos = resultadoOperativo >= 0;
  const puedePagarSueldo = resultadoOperativo > 0;
  const dejaGanancia = resultadoFinal > 0;

  const mesLabel = mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resultado del negocio</h1>
      </div>

      <div className="flex items-center justify-between bg-card rounded-lg border p-2">
        <Button variant="ghost" size="sm" onClick={() => setMes(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-medium capitalize">{mesLabel}</span>
        <Button variant="ghost" size="sm" onClick={() => setMes(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}><ChevronRight className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-8">Cargando...</p>
      ) : (
        <>
          <div className="bg-card rounded-lg border divide-y text-sm">
            <Linea l="Ventas esporádicas" v={r.ingresosEsporadicas} />
            <Linea l="Mensualidades" v={r.ingresosMensualidad} />
            <Linea l="Ingresos totales" v={ingresosTotales} fuerte />
            <Linea l="Costo de mercadería (estimado)" v={-r.costoMercaderia} />
            <Linea l={`Margen bruto${margenBrutoPct != null ? ` · ${margenBrutoPct.toFixed(0)}%` : ''}`} v={margenBruto} fuerte />
            <Linea l="Gastos del negocio" v={-r.gastosNegocio} sub={r.gastosNegocioDeuda > 0 ? `incluye ${formatCurrency(r.gastosNegocioDeuda)} de cuotas de deuda` : undefined} />
            <Linea l="Resultado operativo" v={resultadoOperativo} fuerte />
            <Linea l="Sueldo / retiros" v={-r.sueldo} />
            <Linea l="Resultado final" v={resultadoFinal} fuerte destacado />
          </div>

          <div className="grid gap-2">
            <Respuesta ok={cubreGastos} texto="El negocio cubre sus gastos" />
            <Respuesta ok={puedePagarSueldo} texto="Puede pagarte un sueldo" />
            <Respuesta ok={dejaGanancia} texto="Después de tu sueldo, deja ganancia" />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            {r.ventasSinCosto > 0 && <p>· {r.ventasSinCosto} venta(s) del mes son de productos sin costo cargado — el costo de mercadería está subestimado.</p>}
            <p>· El costo de las viandas entregadas a clientes mensualizados no está incluido en el costo de mercadería (la mensualidad se cobra como abono fijo).</p>
            {r.compromisoDeudaMensual > 0 && <p>· Compromiso mensual de cuotas de deuda del negocio: {formatCurrency(r.compromisoDeudaMensual)} (lo efectivamente pagado este mes ya está dentro de "Gastos del negocio").</p>}
            {r.gastosPersonales > 0 && <p>· Gastos personales del mes (aparte del negocio): {formatCurrency(r.gastosPersonales)}.</p>}
            {cfg && <p>· Costo de mercadería calculado con: menores {cfg.menores_pct}%, respaldo productivo {cfg.fallback_productivo_pct}%.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Linea({ l, v, fuerte, destacado, sub }: { l: string; v: number; fuerte?: boolean; destacado?: boolean; sub?: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${fuerte ? 'font-semibold' : ''} ${destacado ? 'bg-muted/50 text-base' : ''}`}>
      <div>
        <span>{l}</span>
        {sub && <p className="text-xs text-muted-foreground font-normal">{sub}</p>}
      </div>
      <span className={v < 0 ? 'text-destructive' : destacado ? 'text-primary' : ''}>{formatCurrency(v)}</span>
    </div>
  );
}

function Respuesta({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${ok ? 'border-primary/40 bg-primary/5' : 'border-destructive/40 bg-destructive/5'}`}>
      {ok ? <Check className="w-4 h-4 text-primary shrink-0" /> : <X className="w-4 h-4 text-destructive shrink-0" />}
      <span className="font-medium">{texto}</span>
      <span className={`ml-auto text-xs ${ok ? 'text-primary' : 'text-destructive'}`}>{ok ? 'Sí' : 'No'}</span>
    </div>
  );
}
