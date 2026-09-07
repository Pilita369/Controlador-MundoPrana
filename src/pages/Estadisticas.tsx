import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cargarConfigCostos, calcularCostos, type ConfigCostos } from '@/lib/costos';

const COLORS = ['#1D9E75', '#2ab98a', '#45d4a0', '#6eeab8', '#a0f0d0'];
const LINEA_LABEL: Record<string, string> = { congelados: 'Congelados', carta_fija: 'Carta fija', menu_dia: 'Menú del día', reventa: 'Productos' };
const CAT_LABEL: Record<string, string> = { carne: 'Carne', vegetariano: 'Vegetariano', vegano: 'Vegano' };

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
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [cfg, setCfg] = useState<ConfigCostos | null>(null);
  const [aumentos, setAumentos] = useState<{ nombre: string; ini: number; fin: number; pct: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user, periodo]);

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

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-8">Cargando...</p>
      ) : ventas.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No hay ventas en este período</p>
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
