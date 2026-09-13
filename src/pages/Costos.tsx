import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { calcularCostoItem, type ProductoParaCosto } from '@/lib/produccion';
import { actualizarPrecioCosto } from '@/lib/precios';
import {
  cargarConfigCostos, calcularCostos, LABEL_NIVEL_COSTO,
  type ConfigCostos, type DesgloseCostos,
} from '@/lib/costos';

interface ProductoCosto {
  id: string; nombre: string; linea: string; categoria: string | null;
  precio_costo: number; precio_venta: number; costo_packaging: number | null;
  minutos_por_unidad: number | null; rinde_cantidad: number;
}

interface Ingrediente extends ProductoParaCosto { id: string; nombre: string; }

interface FilaReceta {
  _key: string;
  ingredienteId: string;
  nombre: string;
  cantidad: number | '';
  unidad: string;
  costo: number | null;
}

let contador = 0;
const nuevoKey = () => `r${++contador}`;

const LINEA_LABEL: Record<string, string> = { congelados: 'Congelados', carta_fija: 'Carta fija', menu_dia: 'Menú del día', reventa: 'Productos' };
const UNIDADES_SELECT = ['kg', 'g', 'litro', 'ml', 'unidad', 'docena', 'maple', 'paquete', 'porción'];

function colorMargen(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct < 20) return 'text-destructive';
  if (pct < 35) return 'text-amber-500';
  return 'text-primary';
}

export default function Costos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<ConfigCostos | null>(null);
  const [productos, setProductos] = useState<ProductoCosto[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroLinea, setFiltroLinea] = useState('todos');
  const [sel, setSel] = useState<ProductoCosto | null>(null);
  const [edit, setEdit] = useState({ minutos_por_unidad: '', costo_packaging: '', precio_venta: '', precio_costo: '' });
  const [rinde, setRinde] = useState('1');
  const [recetaFilas, setRecetaFilas] = useState<FilaReceta[]>([]);
  const [buscarIngrediente, setBuscarIngrediente] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const [c, p, ing] = await Promise.all([
      cargarConfigCostos(user!.id),
      supabase.from('productos').select('id, nombre, linea, categoria, precio_costo, precio_venta, costo_packaging, minutos_por_unidad, rinde_cantidad')
        .match({ user_id: user!.id, clase: 'elaborado', activo: true }).order('nombre'),
      supabase.from('productos').select('id, nombre, unidad_medida, unidad_uso, equivalencia_uso, precio_costo')
        .eq('user_id', user!.id).eq('activo', true).in('clase', ['materia_prima', 'base']).order('nombre'),
    ]);
    setCfg(c);
    setProductos((p.data as any) ?? []);
    setIngredientes((ing.data as any) ?? []);
  }

  const filas = useMemo(() => {
    if (!cfg) return [];
    return productos
      .filter(p => filtroLinea === 'todos' || p.linea === filtroLinea)
      .filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      .map(p => ({ p, d: calcularCostos(p, cfg) as DesgloseCostos }))
      .sort((a, b) => {
        const ma = a.d.margenPct ?? 999, mb = b.d.margenPct ?? 999;
        return ma - mb;
      });
  }, [productos, cfg, busqueda, filtroLinea]);

  function recalcularFilaReceta(f: FilaReceta): FilaReceta {
    const ing = ingredientes.find(i => i.id === f.ingredienteId);
    if (!ing || f.cantidad === '') return { ...f, costo: null };
    const { costo } = calcularCostoItem(Number(f.cantidad), f.unidad || undefined, ing);
    return { ...f, costo };
  }

  async function abrir(p: ProductoCosto) {
    setSel(p);
    setEdit({
      minutos_por_unidad: p.minutos_por_unidad != null ? String(p.minutos_por_unidad) : '',
      costo_packaging: p.costo_packaging != null ? String(p.costo_packaging) : '',
      precio_venta: p.precio_venta ? String(p.precio_venta) : '',
      precio_costo: p.precio_costo ? String(p.precio_costo) : '',
    });
    setRinde(String(p.rinde_cantidad || 1));
    setBuscarIngrediente('');
    const { data } = await supabase.from('receta_items').select('*').eq('producto_id', p.id).order('orden');
    setRecetaFilas(((data as any[]) ?? []).map(it => recalcularFilaReceta({
      _key: nuevoKey(),
      ingredienteId: it.ingrediente_id ?? '',
      nombre: ingredientes.find(i => i.id === it.ingrediente_id)?.nombre ?? it.nombre_libre ?? '',
      cantidad: it.cantidad ?? '',
      unidad: it.unidad ?? '',
      costo: null,
    })));
  }

  function agregarIngrediente(ing: Ingrediente) {
    if (recetaFilas.some(f => f.ingredienteId === ing.id)) { setBuscarIngrediente(''); return; }
    const fila: FilaReceta = { _key: nuevoKey(), ingredienteId: ing.id, nombre: ing.nombre, cantidad: 1, unidad: ing.unidad_uso ?? ing.unidad_medida, costo: null };
    setRecetaFilas(fs => [...fs, recalcularFilaReceta(fila)]);
    setBuscarIngrediente('');
  }
  function editarFilaReceta(key: string, campos: Partial<FilaReceta>) {
    setRecetaFilas(fs => fs.map(f => f._key === key ? recalcularFilaReceta({ ...f, ...campos }) : f));
  }
  function quitarFilaReceta(key: string) {
    setRecetaFilas(fs => fs.filter(f => f._key !== key));
  }

  const rindeNum = parseFloat(rinde) || 1;
  const tieneReceta = recetaFilas.length > 0;
  const costoRecetaTotal = recetaFilas.reduce((s, f) => s + (f.costo ?? 0), 0);
  const ingredientesCalculados = tieneReceta ? costoRecetaTotal / rindeNum : null;

  const selEfectivo = sel ? {
    precio_costo: ingredientesCalculados ?? (parseFloat(edit.precio_costo) || 0),
    costo_packaging: edit.costo_packaging ? parseFloat(edit.costo_packaging) : null,
    minutos_por_unidad: edit.minutos_por_unidad ? parseFloat(edit.minutos_por_unidad) : null,
    precio_venta: edit.precio_venta ? parseFloat(edit.precio_venta) : 0,
  } : null;
  const selDesglose = selEfectivo && cfg ? calcularCostos(selEfectivo, cfg) : null;

  async function guardarTodo() {
    if (!sel || !user) return;
    setGuardando(true);
    try {
      // 1) Receta: se reemplaza entera (simple y sin riesgo de quedar filas viejas colgadas)
      await supabase.from('receta_items').delete().eq('producto_id', sel.id);
      const conIngrediente = recetaFilas.filter(f => f.ingredienteId && f.cantidad !== '');
      if (conIngrediente.length > 0) {
        await supabase.from('receta_items').insert(conIngrediente.map((f, i) => ({
          user_id: user.id, producto_id: sel.id, ingrediente_id: f.ingredienteId,
          cantidad: Number(f.cantidad), unidad: f.unidad || null, orden: i,
        })));
      }

      // 2) Costo de ingredientes: el de la receta si hay, si no el que se haya tipeado a mano
      const nuevoPrecioCosto = ingredientesCalculados ?? (parseFloat(edit.precio_costo) || 0);
      if (nuevoPrecioCosto > 0) {
        await actualizarPrecioCosto(user.id, sel.id, Math.round(nuevoPrecioCosto * 100) / 100, 'receta');
      }

      // 3) El resto de los campos del producto
      const { error } = await supabase.from('productos').update({
        minutos_por_unidad: edit.minutos_por_unidad ? parseFloat(edit.minutos_por_unidad) : null,
        costo_packaging: edit.costo_packaging ? parseFloat(edit.costo_packaging) : null,
        precio_venta: edit.precio_venta ? parseFloat(edit.precio_venta) : sel.precio_venta,
        precio_venta_manual: true,
        rinde_cantidad: rindeNum,
      }).eq('id', sel.id);
      if (error) throw error;

      toast.success('Guardado');
      setSel(null); load();
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function usarSugerido(sugerido: number) {
    setEdit(f => ({ ...f, precio_venta: String(sugerido) }));
    toast.success(`Precio sugerido: ${formatCurrency(sugerido)} (guardá para confirmar)`);
  }

  const revisar = filas.filter(f => f.d.margenPct != null && f.d.margenPct < 20).length;
  const sinCalcular = filas.filter(f => f.d.nivel === 'sin_calcular').length;

  const candidatosIngrediente = buscarIngrediente
    ? ingredientes.filter(i => i.nombre.toLowerCase().includes(buscarIngrediente.toLowerCase()) && !recetaFilas.some(f => f.ingredienteId === i.id)).slice(0, 6)
    : [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Costos</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/ajustes')}><Settings2 className="w-4 h-4 mr-1" /> Configuración</Button>
      </div>

      {cfg && (
        <div className="bg-card rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
          <p><b className="text-foreground">Directo</b> = costo de ingredientes (de la receta, o cargado a mano) + menores ({cfg.menores_pct}%) + packaging.</p>
          <p><b className="text-foreground">Productivo</b> = directo + minutos × gas/luz/mano de obra, o el {cfg.fallback_productivo_pct}% de respaldo si no cargaste minutos (marcado con *).</p>
          <p><b className="text-foreground">Venta</b> = el precio que tenés cargado en Productos, tal cual.</p>
          <p><b className="text-foreground">Sugerido</b> = productivo + tu markup configurado ({cfg.markup_default}%). Tocá "Configuración" para cambiar estos porcentajes.</p>
        </div>
      )}

      {(revisar > 0 || sinCalcular > 0) && (
        <div className="bg-card rounded-lg border p-3 text-sm flex flex-wrap gap-4">
          {revisar > 0 && <span className="text-destructive">{revisar} con margen bajo (&lt;20%)</span>}
          {sinCalcular > 0 && <span className="text-muted-foreground">{sinCalcular} sin costo cargado</span>}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroLinea} onValueChange={setFiltroLinea}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(LINEA_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filas.map(({ p, d }) => (
          <button key={p.id} onClick={() => abrir(p)} className="w-full text-left bg-card rounded-lg border p-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{p.nombre}</span>
              <Badge variant={d.nivel === 'preciso' ? 'default' : d.nivel === 'estimado' ? 'secondary' : 'outline'} className="text-xs">{LABEL_NIVEL_COSTO[d.nivel]}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
              <div><span className="text-muted-foreground">Directo</span><br />{d.costoDirecto > 0 ? formatCurrency(d.costoDirecto) : '—'}</div>
              <div><span className="text-muted-foreground">Productivo</span><br />{d.costoProductivo > 0 ? formatCurrency(d.costoProductivo) : '—'}{d.productivoEsFallback && <span className="text-muted-foreground"> *</span>}</div>
              <div><span className="text-muted-foreground">Venta</span><br />{d.precioVenta > 0 ? formatCurrency(d.precioVenta) : '—'}</div>
            </div>
            <div className="mt-1 text-sm font-medium">
              Margen: <span className={colorMargen(d.margenPct)}>
                {d.margen != null ? `${formatCurrency(d.margen)} (${d.margenPct!.toFixed(0)}%)` : 'sin datos'}
              </span>
            </div>
            {d.precioSugerido != null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Sugerido: <span className="font-medium text-foreground">{formatCurrency(d.precioSugerido)}</span>
                {' '}(margen conveniente {cfg?.markup_default}%)
                {d.precioVenta > 0 && d.precioSugerido > d.precioVenta && (
                  <span className="text-amber-500 dark:text-amber-400"> · estás {formatCurrency(d.precioSugerido - d.precioVenta)} por debajo</span>
                )}
              </p>
            )}
          </button>
        ))}
        {filas.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Sin productos</p>}
      </div>

      {/* Detalle / edición completa */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{sel?.nombre}</DialogTitle>
            <DialogDescription>Armá la receta y todo se recalcula solo, con las mismas capas de costo de siempre (ingredientes → directo → productivo → precio sugerido).</DialogDescription>
          </DialogHeader>
          {selDesglose && sel && (
            <div className="space-y-4">
              {/* Receta */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receta</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar materia prima o base para agregar..." value={buscarIngrediente} onChange={e => setBuscarIngrediente(e.target.value)} className="pl-9 h-9" />
                  {candidatosIngrediente.length > 0 && (
                    <div className="border rounded-md bg-card shadow-sm max-h-32 overflow-y-auto mt-1">
                      {candidatosIngrediente.map(ing => (
                        <button key={ing.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center" onClick={() => agregarIngrediente(ing)}>
                          <span>{ing.nombre}</span>
                          <span className="text-xs text-muted-foreground">{formatCurrency(ing.precio_costo)}/{ing.unidad_uso ?? ing.unidad_medida}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {recetaFilas.length > 0 && (
                  <div className="space-y-1.5">
                    {recetaFilas.map(f => (
                      <div key={f._key} className="flex items-center gap-1.5">
                        <span className="text-xs flex-1 truncate">{f.nombre}</span>
                        <Input type="number" step="0.01" value={f.cantidad}
                          onChange={e => editarFilaReceta(f._key, { cantidad: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                          className="h-8 w-16 text-xs" />
                        <Select value={f.unidad || 'ninguna'} onValueChange={v => editarFilaReceta(f._key, { unidad: v === 'ninguna' ? '' : v })}>
                          <SelectTrigger className="h-8 w-[5.5rem] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ninguna">-</SelectItem>
                            {UNIDADES_SELECT.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{f.costo != null ? formatCurrency(f.costo) : '—'}</span>
                        <button type="button" onClick={() => quitarFilaReceta(f._key)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-xs">Rinde (cuántas unidades da)</Label>
                    <Input type="number" step="0.01" min={0.01} value={rinde} onChange={e => setRinde(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Costo ingredientes {tieneReceta ? '(de la receta)' : '(manual)'}</Label>
                    <Input type="number" step="0.01" disabled={tieneReceta}
                      value={tieneReceta ? (ingredientesCalculados ?? 0).toFixed(2) : edit.precio_costo}
                      onChange={e => setEdit(f => ({ ...f, precio_costo: e.target.value }))}
                      placeholder="por unidad" />
                  </div>
                </div>
                {tieneReceta && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(costoRecetaTotal)} en total ÷ {rindeNum} = {formatCurrency(ingredientesCalculados ?? 0)} por unidad.
                  </p>
                )}
              </div>

              {/* Desglose completo */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <Fila l="Ingredientes" v={selDesglose.ingredientes} />
                <Fila l={`Menores (${cfg?.menores_pct}%)`} v={selDesglose.menores} />
                {selDesglose.packaging > 0 && <Fila l="Packaging" v={selDesglose.packaging} />}
                <div className="flex justify-between font-medium border-t pt-1"><span>Costo directo</span><span>{formatCurrency(selDesglose.costoDirecto)}</span></div>
                <Fila l={selDesglose.productivoEsFallback ? `Productivo (respaldo ${cfg?.fallback_productivo_pct}%)` : 'Productivo (gas/luz/mano de obra)'} v={selDesglose.productivoExtra} />
                <div className="flex justify-between font-semibold border-t pt-1"><span>Costo productivo</span><span>{formatCurrency(selDesglose.costoProductivo)}</span></div>
                <div className="flex justify-between font-medium"><span>Margen</span><span className={colorMargen(selDesglose.margenPct)}>{selDesglose.margen != null ? `${formatCurrency(selDesglose.margen)} · ${selDesglose.margenPct!.toFixed(0)}%` : 'sin datos'}</span></div>
                {selDesglose.precioSugerido != null && (
                  <div className="flex justify-between items-center border-t pt-1">
                    <span className="text-muted-foreground">Precio sugerido</span>
                    <span className="flex items-center gap-2">{formatCurrency(selDesglose.precioSugerido)}
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => usarSugerido(selDesglose.precioSugerido!)}>Usar</Button>
                    </span>
                  </div>
                )}
              </div>

              {/* Todo lo demás, editable */}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Precio de venta</Label>
                  <Input type="number" step="1" value={edit.precio_venta} onChange={e => setEdit(f => ({ ...f, precio_venta: e.target.value }))} placeholder="0" />
                </div>
                <div><Label className="text-xs">Packaging por unidad</Label>
                  <Input type="number" step="0.01" value={edit.costo_packaging} onChange={e => setEdit(f => ({ ...f, costo_packaging: e.target.value }))} placeholder="opcional" />
                </div>
                <div className="col-span-2"><Label className="text-xs">Minutos por unidad</Label>
                  <Input type="number" step="0.5" value={edit.minutos_por_unidad} onChange={e => setEdit(f => ({ ...f, minutos_por_unidad: e.target.value }))} placeholder="opcional" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Si cargás los minutos, el costo productivo se calcula con gas/luz y mano de obra en vez del % de respaldo (eso se ajusta en Configuración).</p>
              <Button className="w-full" onClick={guardarTodo} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar todo'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fila({ l, v }: { l: string; v: number }) {
  return <div className="flex justify-between text-muted-foreground"><span>{l}</span><span>{formatCurrency(v)}</span></div>;
}
