import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { seedInitialData } from '@/hooks/useSeedData';
import MetricCard from '@/components/MetricCard';
import { formatCurrency } from '@/lib/format';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Receipt, TrendingUp, Wallet, Target, CreditCard, Calendar, ChevronDown, ChevronRight, ChevronLeft, Truck, HandCoins } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#1D9E75', '#2ab98a', '#45d4a0', '#6eeab8', '#a0f0d0', '#c4f5e0'];
const CHART_TOOLTIP = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' };

interface StockBajo { id: string; nombre: string; stock_actual: number; alerta_stock_bajo: number; unidad_medida: string; rubro: string | null; clase: string; linea: string; }
interface MovimientoResumen { categoria: string; direccion: string; total: number; count: number; }

const RUBRO_LABEL: Record<string, string> = { carnes: 'Carnes', verduras: 'Verduras', lacteos: 'Lácteos', granel: 'A granel', otros: 'Otros' };

// Categorias de "movimientos" que se muestran aparte (Facu/alquiler y envios), el resto va a la lista generica
const CATEGORIAS_APARTE = ['movimiento_facundo', 'alquiler', 'envio_cobrado'];
const CATEGORIA_MOV_LABEL: Record<string, string> = {
  prestamo_recibido: 'Préstamo recibido',
  pago_prestamo: 'Pago de préstamo',
  reintegro_natura: 'Reintegro Natura',
  movimiento_familiar: 'Movimiento familiar',
  pendiente_clasificar: 'Pendiente de clasificar',
  movimiento_interno: 'Movimiento interno',
  compras_varias: 'Compras varias',
  movimientos_varios: 'Movimientos varios',
};

function inicioMes(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function rangoMes(d: Date) {
  const y = d.getFullYear(), m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`;
  return { start, end };
}
function labelMes(d: Date) {
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stockBajo, setStockBajo] = useState<StockBajo[]>([]);
  const [alertaAbierta, setAlertaAbierta] = useState(false);
  const [mesSel, setMesSel] = useState(() => inicioMes(new Date()));
  const [ventas, setVentas] = useState(0);
  const [ingresosMensualidad, setIngresosMensualidad] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [sueldoTotal, setSueldoTotal] = useState(0);
  const [gastosPersonales, setGastosPersonales] = useState(0);
  const [meta, setMeta] = useState(300000);
  const [gastosPorCategoria, setGastosPorCategoria] = useState<{ name: string; value: number }[]>([]);
  const [ventasMensuales, setVentasMensuales] = useState<{ mes: string; ventas: number; gastos: number }[]>([]);
  const [enviosCobrados, setEnviosCobrados] = useState(0);
  const [facu, setFacu] = useState({ pilarAFacu: 0, facuAPilar: 0 });
  const [alquiler, setAlquiler] = useState(0);
  const [movimientosVarios, setMovimientosVarios] = useState<MovimientoResumen[]>([]);
  const [pendientesDelMes, setPendientesDelMes] = useState(0);
  const [hayDatosDelMes, setHayDatosDelMes] = useState(true);
  const [loading, setLoading] = useState(true);

  // El stock es estado actual, no depende del mes que se esté mirando: se carga una sola vez.
  useEffect(() => {
    if (!user) return;
    seedInitialData(user.id);
    supabase.from('productos')
      .select('id, nombre, stock_actual, alerta_stock_bajo, unidad_medida, rubro, clase, linea')
      .match({ user_id: user.id, activo: true }).gt('alerta_stock_bajo', 0)
      .then(({ data }) => setStockBajo(((data as any[]) ?? []).filter(p => Number(p.stock_actual) <= Number(p.alerta_stock_bajo))));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadMes(mesSel);
  }, [user, mesSel]);

  async function loadMes(mes: Date) {
    setLoading(true);
    const { start, end } = rangoMes(mes);
    const orFechaOMesRelacionado = `and(fecha.gte.${start},fecha.lte.${end}),and(fecha.is.null,mes_relacionado.gte.${start},mes_relacionado.lte.${end})`;

    const [ventasRes, mensualidadRes, gastosNegRes, gastosPerRes, sueldoRes, ajustesRes, movRes] = await Promise.all([
      supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'esporadico').eq('estado_confirmacion', 'confirmado').gte('fecha', start).lte('fecha', end),
      supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'mensualidad').eq('estado_confirmacion', 'confirmado').gte('fecha', start).lte('fecha', end),
      supabase.from('gastos').select('monto, categorias_gasto(nombre)').eq('user_id', user!.id).eq('tipo', 'negocio').gte('fecha', start).lte('fecha', end),
      supabase.from('gastos').select('monto').eq('user_id', user!.id).eq('tipo', 'personal').gte('fecha', start).lte('fecha', end),
      supabase.from('sueldo_retiros').select('monto').eq('user_id', user!.id).gte('fecha', start).lte('fecha', end),
      supabase.from('ajustes_usuario').select('meta_sueldo_mensual').eq('user_id', user!.id).single(),
      supabase.from('movimientos').select('categoria, direccion, monto, contraparte_nombre, estado_confirmacion').eq('user_id', user!.id).or(orFechaOMesRelacionado),
    ]);

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

    const catMap: Record<string, number> = {};
    gastosNegRes.data?.forEach((g: any) => {
      const name = g.categorias_gasto?.nombre ?? 'Sin categoría';
      catMap[name] = (catMap[name] ?? 0) + Number(g.monto);
    });
    setGastosPorCategoria(Object.entries(catMap).map(([name, value]) => ({ name, value })));

    // Movimientos no comerciales del mes: solo los confirmados entran en los totales.
    const movs = (movRes.data as any[]) ?? [];
    const confirmados = movs.filter(m => m.estado_confirmacion === 'confirmado');
    const pendientes = movs.filter(m => m.estado_confirmacion === 'pendiente');
    setPendientesDelMes(pendientes.length);

    const envios = confirmados.filter(m => m.categoria === 'envio_cobrado').reduce((s, m) => s + Number(m.monto), 0);
    setEnviosCobrados(envios);

    const totalAlquiler = confirmados.filter(m => m.categoria === 'alquiler').reduce((s, m) => s + Number(m.monto), 0);
    setAlquiler(totalAlquiler);

    const conFacu = confirmados.filter(m => m.contraparte_nombre === 'Facundo Nahuel Freire');
    setFacu({
      pilarAFacu: conFacu.filter(m => m.direccion === 'salida').reduce((s, m) => s + Number(m.monto), 0),
      facuAPilar: conFacu.filter(m => m.direccion === 'entrada').reduce((s, m) => s + Number(m.monto), 0),
    });

    const resto = confirmados.filter(m => !CATEGORIAS_APARTE.includes(m.categoria));
    const restoMap: Record<string, MovimientoResumen> = {};
    resto.forEach((m: any) => {
      const key = `${m.categoria}_${m.direccion}`;
      if (!restoMap[key]) restoMap[key] = { categoria: m.categoria, direccion: m.direccion, total: 0, count: 0 };
      restoMap[key].total += Number(m.monto);
      restoMap[key].count += 1;
    });
    setMovimientosVarios(Object.values(restoMap));

    setHayDatosDelMes(
      (ventasRes.data?.length ?? 0) + (mensualidadRes.data?.length ?? 0) + movs.length > 0
    );

    // Tendencia: los 6 meses hasta el seleccionado (inclusive), para que acompañe el mismo mes que se está mirando.
    const monthData: { mes: string; ventas: number; gastos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(mes.getFullYear(), mes.getMonth() - i, 1);
      const r = rangoMes(d);
      const mesLabel = d.toLocaleDateString('es-AR', { month: 'short' });

      const [v, m, g] = await Promise.all([
        supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'esporadico').eq('estado_confirmacion', 'confirmado').gte('fecha', r.start).lte('fecha', r.end),
        supabase.from('pedidos').select('total').eq('user_id', user!.id).eq('tipo_ingreso', 'mensualidad').eq('estado_confirmacion', 'confirmado').gte('fecha', r.start).lte('fecha', r.end),
        supabase.from('gastos').select('monto').eq('user_id', user!.id).eq('tipo', 'negocio').gte('fecha', r.start).lte('fecha', r.end),
      ]);

      monthData.push({
        mes: mesLabel,
        ventas: (v.data?.reduce((s, x) => s + Number(x.total), 0) ?? 0) + (m.data?.reduce((s, x) => s + Number(x.total), 0) ?? 0),
        gastos: g.data?.reduce((s, x) => s + Number(x.monto), 0) ?? 0,
      });
    }
    setVentasMensuales(monthData);
    setLoading(false);
  }

  const balance = ventas + ingresosMensualidad - gastos;
  const balancePersonal = sueldoTotal - gastosPersonales;
  const progreso = meta > 0 ? Math.min((sueldoTotal / meta) * 100, 100) : 0;
  const facuNeto = facu.facuAPilar - facu.pilarAFacu;

  const materiaBaja = stockBajo.filter(p => p.clase === 'materia_prima');
  const congeladosBajos = stockBajo.filter(p => p.clase === 'elaborado' && p.linea === 'congelados');
  const materiaPorRubro = materiaBaja.reduce<Record<string, StockBajo[]>>((acc, p) => {
    const g = RUBRO_LABEL[p.rubro ?? ''] ?? 'Sin rubro';
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  const esMesActual = mesSel.getFullYear() === new Date().getFullYear() && mesSel.getMonth() === new Date().getMonth();

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

      {/* Selector de mes: todo lo de abajo corresponde a este mes */}
      <div className="flex items-center justify-between bg-card rounded-lg border p-2">
        <Button variant="ghost" size="sm" onClick={() => setMesSel(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-medium text-sm">{labelMes(mesSel)}</span>
        <Button variant="ghost" size="sm" disabled={esMesActual} onClick={() => setMesSel(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground text-sm">Cargando...</p>
        </div>
      ) : !hayDatosDelMes ? (
        <div className="bg-card rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Sin datos cargados para {labelMes(mesSel).toLowerCase()}
        </div>
      ) : (
      <>
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard title="Ventas esporádicas" value={formatCurrency(ventas)} icon={<ShoppingCart className="w-4 h-4" />} />
        <MetricCard title="Mensualidad" value={formatCurrency(ingresosMensualidad)} icon={<Calendar className="w-4 h-4" />} />
        <MetricCard title="Gastos negocio" value={formatCurrency(gastos)} icon={<Receipt className="w-4 h-4" />} />
        <MetricCard title="Balance negocio" value={formatCurrency(balance)} icon={<TrendingUp className="w-4 h-4" />} />
        <MetricCard title="Mi sueldo" value={formatCurrency(sueldoTotal)} icon={<Wallet className="w-4 h-4" />} />
        {enviosCobrados > 0 && <MetricCard title="Envíos cobrados" value={formatCurrency(enviosCobrados)} icon={<Truck className="w-4 h-4" />} />}
      </div>

      {/* Facu + alquiler del mes: no es facturación, pero Pilar quiere verlo separado y claro */}
      {(facu.pilarAFacu > 0 || facu.facuAPilar > 0 || alquiler > 0) && (
        <div className="bg-card rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2"><HandCoins className="w-4 h-4 text-muted-foreground" /> Facundo y alquiler este mes</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pilar → Facundo</span><span>{formatCurrency(facu.pilarAFacu)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Facundo → Pilar</span><span>{formatCurrency(facu.facuAPilar)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Alquiler (total, cualquier cuenta)</span><span>{formatCurrency(alquiler)}</span></div>
            <div className="flex justify-between font-medium"><span>Diferencia neta</span><span className={facuNeto < 0 ? 'text-destructive' : ''}>{formatCurrency(facuNeto)}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">Ninguno de estos montos es facturación de Mundo Prana. Desde junio 2026, lo que Pilar le transfiere a Facundo se toma como aporte al alquiler salvo que se corrija.</p>
        </div>
      )}

      {/* Otros movimientos del mes (préstamos, Natura, familiares, sin clasificar) */}
      {movimientosVarios.length > 0 && (
        <div className="bg-card rounded-lg border p-4 space-y-1.5">
          <h3 className="text-sm font-medium mb-1">Otros movimientos del mes (no son ventas)</h3>
          {movimientosVarios.map(m => (
            <div key={`${m.categoria}_${m.direccion}`} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{CATEGORIA_MOV_LABEL[m.categoria] ?? m.categoria} {m.direccion === 'entrada' ? '(entrada)' : '(salida)'}{m.count > 1 ? ` ×${m.count}` : ''}</span>
              <span>{formatCurrency(m.total)}</span>
            </div>
          ))}
        </div>
      )}

      {pendientesDelMes > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-600 dark:text-amber-400">
          Hay {pendientesDelMes} movimiento{pendientesDelMes > 1 ? 's' : ''} de este mes pendiente{pendientesDelMes > 1 ? 's' : ''} de revisar (no se suman a los totales de arriba).
        </div>
      )}

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
      </>
      )}
    </div>
  );
}
