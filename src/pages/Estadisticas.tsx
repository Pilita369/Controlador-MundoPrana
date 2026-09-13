import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cargarConfigCostos, calcularCostos, type ConfigCostos } from '@/lib/costos';

const COLORS = ['#1D9E75', '#2ab98a', '#45d4a0', '#6eeab8', '#a0f0d0'];
const LINEA_LABEL: Record<string, string> = { congelados: 'Congelados', carta_fija: 'Carta fija', menu_dia: 'Menú del día', reventa: 'Productos' };
const CAT_LABEL: Record<string, string> = { carne: 'Carne', vegetariano: 'Vegetariano', vegano: 'Vegano' };
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CHART_TOOLTIP = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' };

interface MesCurva { mes: string; ventas: number; gastos: number; hayVentas: boolean; hayGastos: boolean; }

type Periodo = 'mes' | 'mes_pasado' | 'trim' | 'anio';

function rango(p: Periodo): { s: string; e: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'mes') return { s: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), e: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (p === 'mes_pasado') return { s: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), e: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (p === 'trim') return { s: fmt(new Date(now.getFullYear(), now.getMonth() - 2, 1)), e: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  return { s: fmt(new Date(now.getFullYear(), 0, 1)), e: fmt(new Date(now.getFullYear(), 11, 31)) };
}

interface VentaRow { cantidad: number; total: number; producto_id: string; productos: { nombre: string; categoria: string | null; linea: string | null } | null; }

export default function Estadisticas() {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [curvaMensual, setCurvaMensual] = useState<MesCurva[]>([]);
  const [loadingCurva, setLoadingCurva] = useState(true);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [cfg, setCfg] = useState<ConfigCostos | null>(null);
  const [aumentos, setAumentos] = useState<{ nombre: string; ini: number; fin: number; pct: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user, periodo]);
  useEffect(() => { if (user) loadCurvaMensual(); }, [user, anio]);

  // Ventas y gastos por mes de todo el año, para poder comparar un mes con otro.
  // Ventas = pedidos confirmados (esporadicos + mensualidad); no depende de tener el detalle
  // de producto cargado, así que incluye tambien las ventas "por categoria" sin items.
  async function loadCurvaMensual() {
    setLoadingCurva(true);
    const inicioAnio = `${anio}-01-01`;
    const finAnio = `${anio}-12-31`;
    const [pedRes, gastRes] = await Promise.all([
      supabase.from('pedidos').select('fecha, total').eq('user_id', user!.id).eq('estado_confirmacion', 'confirmado').gte('fecha', inicioAnio).lte('fecha', finAnio),
      supabase.from('gastos').select('fecha, monto').eq('user_id', user!.id).eq('tipo', 'negocio').gte('fecha', inicioAnio).lte('fecha', finAnio),
    ]);
    const porMes: MesCurva[] = MESES_CORTOS.map(mes => ({ mes, ventas: 0, gastos: 0, hayVentas: false, hayGastos: false }));
    (pedRes.data ?? []).forEach((p: any) => {
      const m = parseInt(p.fecha.slice(5, 7), 10) - 1;
      if (porMes[m]) { porMes[m].ventas += Number(p.total); porMes[m].hayVentas = true; }
    });
    (gastRes.data ?? []).forEach((g: any) => {
      const m = parseInt(g.fecha.slice(5, 7), 10) - 1;
      if (porMes[m]) { porMes[m].gastos += Number(g.monto); porMes[m].hayGastos = true; }
    });
    setCurvaMensual(porMes);
    setLoadingCurva(false);
  }

  async function load() {
    setLoading(true);
    const { s, e } = rango(periodo);
    const [vRes, pRes, config, phRes] = await Promise.all([
      supabase.from('ventas').select('cantidad, total, producto_id, productos(nombre, categoria, linea)').eq('user_id', user!.id).gte('fecha', s).lte('fecha', e),
      supabase.from('productos').select('id, nombre, categoria, linea, precio_costo, precio_venta, costo_packaging, minutos_por_unidad').match({ user_id: user!.id, clase: 'elaborado', activo: true }),
      cargarConfigCostos(user!.id),
      supabase.from('precios_historial').select('precio_costo, created_at, productos(nombre)').eq('user_id', user!.id).gte('created_at', s).order('created_at', { ascending: true }),
    ]);
    setVentas((vRes.data as any) ?? []);
    setProductos((pRes.data as any) ?? []);
    setCfg(config);

    // aumentos de costo en el periodo
    const porProd: Record<string, { nombre: string; ini: number; fin: number }> = {};
    ((phRes.data as any) ?? []).forEach((h: any) => {
      const n = h.productos?.nombre ?? '?';
      if (!porProd[n]) porProd[n] = { nombre: n, ini: Number(h.precio_costo), fin: Number(h.precio_costo) };
      else porProd[n].fin = Number(h.precio_costo);
    });
    setAumentos(
      Object.values(porProd)
        .filter(x => x.fin > x.ini && x.ini > 0)
        .map(x => ({ ...x, pct: ((x.fin - x.ini) / x.ini) * 100 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5),
    );
    setLoading(false);
  }

  const masVendidos = useMemo(() => {
    const m: Record<string, { nombre: string; cantidad: number; total: number }> = {};
    ventas.forEach(v => {
      const n = v.productos?.nombre ?? 'Producto eliminado';
      if (!m[n]) m[n] = { nombre: n, cantidad: 0, total: 0 };
      m[n].cantidad += Number(v.cantidad);
      m[n].total += Number(v.total);
    });
    return Object.values(m).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8);
  }, [ventas]);

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {};
    ventas.forEach(v => { const c = v.productos?.categoria; if (c) m[c] = (m[c] ?? 0) + Number(v.total); });
    return Object.entries(m).map(([k, total]) => ({ nombre: CAT_LABEL[k] ?? k, total }));
  }, [ventas]);

  const porLinea = useMemo(() => {
    const m: Record<string, number> = {};
    ventas.forEach(v => { const l = v.productos?.linea; if (l) m[l] = (m[l] ?? 0) + Number(v.total); });
    return Object.entries(m).map(([k, total]) => ({ nombre: LINEA_LABEL[k] ?? k, total })).sort((a, b) => b.total - a.total);
  }, [ventas]);

  const margenes = useMemo(() => {
    if (!cfg) return [];
    return productos
      .map(p => ({ nombre: p.nombre, pct: calcularCostos(p, cfg).margenPct }))
      .filter(x => x.pct != null)
      .sort((a, b) => (b.pct as number) - (a.pct as number));
  }, [productos, cfg]);

  const mejores = margenes.slice(0, 3);
  const peores = margenes.slice(-3).reverse();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <Select value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="mes_pasado">Mes pasado</SelectItem>
            <SelectItem value="trim">Últimos 3 meses</SelectItem>
            <SelectItem value="anio">Este año</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Curvas mensuales: ventas y gastos, mes a mes, para comparar contra otros meses */}
      <section className="bg-card rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Ventas por mes</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setAnio(a => a - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium w-12 text-center">{anio}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={anio >= new Date().getFullYear()} onClick={() => setAnio(a => a + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        {loadingCurva ? (
          <p className="text-muted-foreground text-sm text-center py-8">Cargando...</p>
        ) : curvaMensual.every(m => !m.hayVentas) ? (
          <p className="text-muted-foreground text-xs text-center py-6">Sin ventas cargadas en {anio}</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={curvaMensual.map(m => ({ ...m, ventas: m.hayVentas ? m.ventas : null }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => v == null ? 'Sin datos' : formatCurrency(v)} />
              <Line type="monotone" dataKey="ventas" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="bg-card rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Gastos del negocio por mes</h3>
        {loadingCurva ? (
          <p className="text-muted-foreground text-sm text-center py-8">Cargando...</p>
        ) : curvaMensual.every(m => !m.hayGastos) ? (
          <p className="text-muted-foreground text-xs text-center py-6">Sin gastos cargados en {anio}</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={curvaMensual.map(m => ({ ...m, gastos: m.hayGastos ? m.gastos : null }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => v == null ? 'Sin datos' : formatCurrency(v)} />
              <Line type="monotone" dataKey="gastos" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs text-muted-foreground">Compras de materia prima incluidas si se cargaron como gasto de negocio. Un mes sin marca no tiene datos cargados (no es lo mismo que $0).</p>
      </section>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-8">Cargando el detalle del período...</p>
      ) : ventas.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No hay ventas con detalle de producto en este período (puede haber ventas "por categoría" que no aparecen acá, pero sí en las curvas de arriba).</p>
      ) : (
        <>
          <section className="bg-card rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-medium">Más vendidos</h3>
            {masVendidos.map((p, i) => (
              <div key={p.nombre} className="flex items-center justify-between text-sm">
                <span className="truncate">{i + 1}. {p.nombre}</span>
                <span className="text-muted-foreground shrink-0 ml-2">{p.cantidad} u · {formatCurrency(p.total)}</span>
              </div>
            ))}
          </section>

          {porCategoria.length > 0 && (
            <section className="bg-card rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">Ventas por categoría</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={porCategoria} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="category" dataKey="nombre" width={80} fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {porLinea.length > 0 && (
            <section className="bg-card rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">Ventas por línea</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={porLinea} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="category" dataKey="nombre" width={90} fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#1D9E75" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {margenes.length > 0 && (
            <section className="bg-card rounded-lg border p-4 space-y-3">
              <div>
                <h3 className="text-sm font-medium mb-1">Mejor margen</h3>
                {mejores.map(m => <div key={m.nombre} className="flex justify-between text-sm"><span className="truncate">{m.nombre}</span><span className="text-primary shrink-0 ml-2">{(m.pct as number).toFixed(0)}%</span></div>)}
              </div>
              <div>
                <h3 className="text-sm font-medium mb-1">A revisar (margen más bajo)</h3>
                {peores.map(m => <div key={m.nombre} className="flex justify-between text-sm"><span className="truncate">{m.nombre}</span><span className={`shrink-0 ml-2 ${(m.pct as number) < 20 ? 'text-destructive' : 'text-amber-500'}`}>{(m.pct as number).toFixed(0)}%</span></div>)}
              </div>
            </section>
          )}

          {aumentos.length > 0 && (
            <section className="bg-card rounded-lg border p-4 space-y-2">
              <h3 className="text-sm font-medium">Costos que más aumentaron</h3>
              {aumentos.map(a => (
                <div key={a.nombre} className="flex items-center justify-between text-sm">
                  <span className="truncate">{a.nombre}</span>
                  <span className="shrink-0 ml-2 flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{formatCurrency(a.ini)} → {formatCurrency(a.fin)}</span>
                    <Badge variant="destructive" className="text-xs">+{a.pct.toFixed(0)}%</Badge>
                  </span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
