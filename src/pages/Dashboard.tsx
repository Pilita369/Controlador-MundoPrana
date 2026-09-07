import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { seedInitialData } from '@/hooks/useSeedData';
import MetricCard from '@/components/MetricCard';
import { formatCurrency } from '@/lib/format';
import { Progress } from '@/components/ui/progress';
import { ShoppingCart, Receipt, TrendingUp, Wallet, Target, CreditCard, Calendar, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#1D9E75', '#2ab98a', '#45d4a0', '#6eeab8', '#a0f0d0', '#c4f5e0'];
const CHART_TOOLTIP = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' };

interface StockBajo { id: string; nombre: string; stock_actual: number; alerta_stock_bajo: number; unidad_medida: string; rubro: string | null; clase: string; linea: string; }

const RUBRO_LABEL: Record<string, string> = { carnes: 'Carnes', verduras: 'Verduras', lacteos: 'Lácteos', granel: 'A granel', otros: 'Otros' };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stockBajo, setStockBajo] = useState<StockBajo[]>([]);
  const [alertaAbierta, setAlertaAbierta] = useState(false);
  const [ventas, setVentas] = useState(0);
  const [ingresosMensualidad, setIngresosMensualidad] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [sueldoTotal, setSueldoTotal] = useState(0);
  const [gastosPersonales, setGastosPersonales] = useState(0);
  const [meta, setMeta] = useState(300000);
  const [gastosPorCategoria, setGastosPorCategoria] = useState<{ name: string; value: number }[]>([]);
  const [ventasMensuales, setVentasMensuales] = useState<{ mes: string; ventas: number; gastos: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    if (!user) return;
    await seedInitialData(user.id);

    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

    const [ventasRes, mensualidadRes, gastosNegRes, gastosPerRes, sueldoRes, ajustesRes] = await Promise.all([
      supabase.from('ventas').select('total').eq('user_id', user.id).gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('pedidos').select('total').eq('user_id', user.id).eq('tipo_ingreso', 'mensualidad').gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('gastos').select('monto, categorias_gasto(nombre)').eq('user_id', user.id).eq('tipo', 'negocio').gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('gastos').select('monto').eq('user_id', user.id).eq('tipo', 'personal').gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('sueldo_retiros').select('monto').eq('user_id', user.id).gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('ajustes_usuario').select('meta_sueldo_mensual').eq('user_id', user.id).single(),
    ]);

    // "ventas" son las esporádicas (ya pasan por la tabla ventas, item por item).
    // La mensualidad es un ingreso cobrado por adelantado, no genera filas en ventas.
    const totalVentas = ventasRes.data?.reduce((s, v) => s + Number(v.total), 0) ?? 0;
    const totalMensualidad = mensualidadRes.data?.reduce((s, p) => s + Number(p.total), 0) ?? 0;
    const totalGastos = gastosNegRes.data?.reduce((s, g) => s + Number(g.monto), 0) ?? 0;
    const totalGastosPersonales = gastosPerRes.data?.reduce((s, g) => s + Number(g.monto), 0) ?? 0;
    const totalSueldo = sueldoRes.data?.reduce((s, r) => s + Number(r.monto), 0) ?? 0;

    setVentas(totalVentas);
    setIngresosMensualidad(totalMensualidad);
    setGastos(totalGastos);
    setGastosPersonales(totalGastosPersonales);
    setSueldoTotal(totalSueldo);
    setMeta(ajustesRes.data?.meta_sueldo_mensual ?? 300000);

    const { data: prodStock } = await supabase.from('productos')
      .select('id, nombre, stock_actual, alerta_stock_bajo, unidad_medida, rubro, clase, linea')
      .match({ user_id: user.id, activo: true }).gt('alerta_stock_bajo', 0);
    setStockBajo(((prodStock as any[]) ?? []).filter(p => Number(p.stock_actual) <= Number(p.alerta_stock_bajo)));

    const catMap: Record<string, number> = {};
    gastosNegRes.data?.forEach((g: any) => {
      const name = g.categorias_gasto?.nombre ?? 'Sin categoría';
      catMap[name] = (catMap[name] ?? 0) + Number(g.monto);
    });
    setGastosPorCategoria(Object.entries(catMap).map(([name, value]) => ({ name, value })));

    const monthData: { mes: string; ventas: number; gastos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`;
      const mesLabel = d.toLocaleDateString('es-AR', { month: 'short' });

      const [v, m, g] = await Promise.all([
        supabase.from('ventas').select('total').eq('user_id', user!.id).gte('fecha', start).lte('fecha', end),
        supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'mensualidad').gte('fecha', start).lte('fecha', end),
        supabase.from('gastos').select('monto').eq('user_id', user!.id).eq('tipo', 'negocio').gte('fecha', start).lte('fecha', end),
      ]);

      // el grafico de tendencia muestra el ingreso total (esporadico + mensualidad)
      monthData.push({
        mes: mesLabel,
        ventas: (v.data?.reduce((s, x) => s + Number(x.total), 0) ?? 0) + (m.data?.reduce((s, x) => s + Number(x.total), 0) ?? 0),
        gastos: g.data?.reduce((s, x) => s + Number(x.monto), 0) ?? 0,
      });
    }

    setVentasMensuales(monthData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const balance = ventas + ingresosMensualidad - gastos;
  const balancePersonal = sueldoTotal - gastosPersonales;
  const progreso = meta > 0 ? Math.min((sueldoTotal / meta) * 100, 100) : 0;

  const materiaBaja = stockBajo.filter(p => p.clase === 'materia_prima');
  const congeladosBajos = stockBajo.filter(p => p.clase === 'elaborado' && p.linea === 'congelados');
  const materiaPorRubro = materiaBaja.reduce<Record<string, StockBajo[]>>((acc, p) => {
    const g = RUBRO_LABEL[p.rubro ?? ''] ?? 'Sin rubro';
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Encabezado principal con logo a la izquierda */}
      <div className="flex items-center gap-3">
        <img
          src="/logo.cuchara.webp"
          alt="Finanzas · Mundo Prana"
          className="w-10 h-10 object-contain"
        />

        <div>
          <h1 className="text-2xl font-bold">Finanzas · Mundo Prana</h1>
          <p className="text-muted-foreground text-sm">Inicio</p>
        </div>
      </div>

      {(materiaBaja.length > 0 || congeladosBajos.length > 0) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 overflow-hidden">
          <button onClick={() => setAlertaAbierta(v => !v)} className="w-full flex items-center gap-2 p-3 text-sm text-destructive font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            Para revisar
            <span className="text-xs font-normal text-muted-foreground">
              {materiaBaja.length > 0 && `${materiaBaja.length} materia prima`}
              {materiaBaja.length > 0 && congeladosBajos.length > 0 && ' · '}
              {congeladosBajos.length > 0 && `${congeladosBajos.length} congelados`}
            </span>
            {alertaAbierta ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          {alertaAbierta && (
            <div className="px-3 pb-3 space-y-4">
              {materiaBaja.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Reponer materia prima</p>
                  {Object.entries(materiaPorRubro).map(([grupo, items]) => (
                    <div key={grupo} className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{grupo}</p>
                      {items.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border-2 border-destructive/60 bg-destructive/5 px-3 py-2">
                          <span className="text-sm font-medium">{p.nombre}</span>
                          <div className="flex flex-col items-end shrink-0 leading-none">
                            <span className="text-lg font-bold tabular-nums text-amber-500 dark:text-amber-400">
                              {p.stock_actual} {p.unidad_medida}
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5">aviso: {p.alerta_stock_bajo}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {congeladosBajos.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Congelados con stock bajo</p>
                  {congeladosBajos.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border-2 border-destructive/60 bg-destructive/5 px-3 py-2">
                      <span className="text-sm font-medium">{p.nombre}</span>
                      <div className="flex flex-col items-end shrink-0 leading-none">
                        <span className="text-lg font-bold tabular-nums text-amber-500 dark:text-amber-400">
                          {p.stock_actual} {p.unidad_medida}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">aviso: {p.alerta_stock_bajo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/productos')} className="text-xs text-primary font-medium">Ir a Productos →</button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard title="Ventas esporádicas" value={formatCurrency(ventas)} icon={<ShoppingCart className="w-4 h-4" />} />
        <MetricCard title="Mensualidad" value={formatCurrency(ingresosMensualidad)} icon={<Calendar className="w-4 h-4" />} />
        <MetricCard title="Gastos negocio" value={formatCurrency(gastos)} icon={<Receipt className="w-4 h-4" />} />
        <MetricCard title="Balance negocio" value={formatCurrency(balance)} icon={<TrendingUp className="w-4 h-4" />} />
        <MetricCard title="Mi sueldo" value={formatCurrency(sueldoTotal)} icon={<Wallet className="w-4 h-4" />} />
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Target className="w-4 h-4" />
            Meta mensual
          </span>
          <span className="font-medium">
            {formatCurrency(sueldoTotal)} / {formatCurrency(meta)}
          </span>
        </div>
        <Progress value={progreso} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">{progreso.toFixed(0)}%</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Gastos personales" value={formatCurrency(gastosPersonales)} icon={<CreditCard className="w-4 h-4" />} />
        <MetricCard title="Balance personal" value={formatCurrency(balancePersonal)} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-medium mb-3">Gastos por categoría</h3>
          {gastosPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={gastosPorCategoria}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  stroke="none"
                >
                  {gastosPorCategoria.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm">Sin datos</p>
          )}
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-medium mb-3">Ventas vs Gastos (6 meses)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ventasMensuales}>
              <XAxis dataKey="mes" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="ventas" fill="#1D9E75" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}