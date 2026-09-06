import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit2, AlertTriangle, History, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import ImportarIA from '@/components/ImportarIA';
import ActualizarPrecios from '@/components/ActualizarPrecios';
import RegistrarCompra from '@/components/RegistrarCompra';
import { cargarHistorialPrecio, type EntradaHistorial } from '@/lib/precios';
import { cargarCompras, type CompraResumen } from '@/lib/compras';

type Clase = 'elaborado' | 'base' | 'materia_prima';
type Linea = 'congelados' | 'menu_dia' | 'reventa' | 'carta_fija';
type TabKey = 'congelados' | 'menu_dia' | 'reventa' | 'carta_fija' | 'bases' | 'materia';

interface Producto {
  id: string; nombre: string; tipo: string; precio_costo: number; precio_venta: number;
  porcentaje_ganancia: number | null; precio_venta_manual: boolean; stock_actual: number;
  unidad_medida: string; alerta_stock_bajo: number; activo: boolean; es_materia_prima: boolean;
  clase: string | null; categoria: string | null; linea: string | null;
  unidad_uso: string | null; equivalencia_uso: number | null;
  minutos_por_unidad: number | null; costo_packaging: number | null;
}
interface Movimiento { id: string; tipo: string; cantidad: number; notas: string | null; created_at: string; productos: { nombre: string } | null; }

const base = { nombre: '', tipo: 'fresco', precio_costo: 0, precio_venta: 0, porcentaje_ganancia: 0, precio_venta_manual: true, stock_actual: 0, alerta_stock_bajo: 5, activo: true, categoria: '', linea: 'carta_fija' as Linea, unidad_uso: '', equivalencia_uso: 0, minutos_por_unidad: '', costo_packaging: '' };
const defaultBase = { ...base, unidad_medida: 'unidad', alerta_stock_bajo: 1 };
const defaultMateria = { ...base, unidad_medida: 'kg', alerta_stock_bajo: 1 };

interface TabDef { key: TabKey; label: string; clase: Clase; linea?: Linea; singular: string; tipoDefault?: string; }
const TABS: TabDef[] = [
  { key: 'congelados', label: 'Congelados', clase: 'elaborado', linea: 'congelados', singular: 'congelado', tipoDefault: 'congelado' },
  { key: 'carta_fija', label: 'Carta fija', clase: 'elaborado', linea: 'carta_fija', singular: 'producto', tipoDefault: 'fresco' },
  { key: 'menu_dia', label: 'Menú día', clase: 'elaborado', linea: 'menu_dia', singular: 'menú', tipoDefault: 'fresco' },
  { key: 'reventa', label: 'Productos', clase: 'elaborado', linea: 'reventa', singular: 'producto', tipoDefault: 'fresco' },
  { key: 'bases', label: 'Bases', clase: 'base', singular: 'base' },
  { key: 'materia', label: 'Materia prima', clase: 'materia_prima', singular: 'materia prima' },
];
const LINEA_LABEL: Record<Linea, string> = { congelados: 'Congelados', menu_dia: 'Menú del día', reventa: 'Productos', carta_fija: 'Carta fija' };

function lineaDe(p: Producto): Linea {
  return (p.linea === 'congelados' || p.linea === 'menu_dia' || p.linea === 'reventa') ? p.linea : 'carta_fija';
}

function defaultForm(tabKey: TabKey) {
  const def = TABS.find(t => t.key === tabKey)!;
  if (def.clase === 'materia_prima') return defaultMateria;
  if (def.clase === 'base') return defaultBase;
  return { ...base, unidad_medida: 'unidad', tipo: def.tipoDefault ?? 'fresco', linea: (def.linea ?? 'otros') as Linea };
}

// Conversiones fijas y conocidas: no tiene sentido pedirle a Pilar que las escriba.
function equivalenciaFija(unidadMedida: string, unidadUso: string): number | undefined {
  if (unidadMedida === 'kg' && unidadUso === 'g') return 1000;
  if (unidadMedida === 'litro' && unidadUso === 'ml') return 1000;
  return undefined;
}

function claseDe(p: Producto): Clase {
  if (p.clase === 'base' || p.clase === 'materia_prima' || p.clase === 'elaborado') return p.clase;
  return p.es_materia_prima ? 'materia_prima' : 'elaborado';
}

export default function Productos() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tab, setTab] = useState<TabKey>('congelados');
  const [busqueda, setBusqueda] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm('congelados'));
  const [showHistory, setShowHistory] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteProducto, setAjusteProducto] = useState<Producto | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [deleteMultiConfirm, setDeleteMultiConfirm] = useState(false);
  const [deleteSingleId, setDeleteSingleId] = useState<string | null>(null);
  const [historialPrecio, setHistorialPrecio] = useState<EntradaHistorial[]>([]);
  const [historialCompras, setHistorialCompras] = useState<CompraResumen[]>([]);
  const [filtroCat, setFiltroCat] = useState('');

  useEffect(() => { if (user) load(); }, [user]);
  useEffect(() => { setBusqueda(''); setSelected(new Set()); setSelectMode(false); setFiltroCat(''); }, [tab]);

  async function load() {
    const { data } = await supabase.from('productos').select('*').eq('user_id', user!.id).order('nombre');
    setProductos((data as any) ?? []);
  }

  const tabDef = TABS.find(t => t.key === tab)!;
  const claseTab = tabDef.clase;
  const esMateria = tab === 'materia';
  const esVendible = tabDef.clase === 'elaborado';
  const enTab = productos
    .filter(p => claseDe(p) === claseTab)
    .filter(p => tabDef.linea == null || lineaDe(p) === tabDef.linea);
  const catsPresentes = ['carne', 'vegetariano', 'vegano'].filter(c => enTab.some(p => p.categoria === c));
  const listaFiltrada = enTab
    .filter(p => !filtroCat || p.categoria === filtroCat)
    .filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  function openNew() {
    setEditId(null);
    setHistorialPrecio([]);
    setForm(defaultForm(tab));
    setOpen(true);
  }

  function openEdit(p: Producto) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, tipo: p.tipo, precio_costo: p.precio_costo, precio_venta: p.precio_venta,
      porcentaje_ganancia: p.porcentaje_ganancia ?? 0, precio_venta_manual: p.precio_venta_manual,
      stock_actual: p.stock_actual, unidad_medida: p.unidad_medida,
      alerta_stock_bajo: p.alerta_stock_bajo, activo: p.activo, categoria: p.categoria ?? '',
      linea: lineaDe(p), unidad_uso: p.unidad_uso ?? '', equivalencia_uso: p.equivalencia_uso ?? 0,
      minutos_por_unidad: p.minutos_por_unidad != null ? String(p.minutos_por_unidad) : '',
      costo_packaging: p.costo_packaging != null ? String(p.costo_packaging) : '',
    });
    setOpen(true);
    cargarHistorialPrecio(p.id).then(setHistorialPrecio);
    setHistorialCompras([]);
    if (claseDe(p) === 'materia_prima') cargarCompras(p.id).then(setHistorialCompras);
  }

  function calcPrecioSugerido() {
    if (!form.precio_venta_manual && form.porcentaje_ganancia > 0) {
      const sugerido = form.precio_costo * (1 + form.porcentaje_ganancia / 100);
      setForm(f => ({ ...f, precio_venta: Math.round(sugerido * 100) / 100 }));
    }
  }

  useEffect(() => { calcPrecioSugerido(); }, [form.precio_costo, form.porcentaje_ganancia, form.precio_venta_manual]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      user_id: user!.id,
      clase: claseTab,
      es_materia_prima: claseTab === 'materia_prima',
      categoria: form.categoria || null,
      linea: esVendible ? (form.linea || 'carta_fija') : 'carta_fija',
      porcentaje_ganancia: form.precio_venta_manual ? null : form.porcentaje_ganancia,
      precio_venta: esVendible ? form.precio_venta : 0,
      unidad_uso: esMateria && form.unidad_uso ? form.unidad_uso : null,
      equivalencia_uso: esMateria && form.unidad_uso && form.equivalencia_uso > 0 ? form.equivalencia_uso : null,
      minutos_por_unidad: esVendible && form.minutos_por_unidad ? parseFloat(form.minutos_por_unidad) : null,
      costo_packaging: esVendible && form.costo_packaging ? parseFloat(form.costo_packaging) : null,
    };
    if (editId) {
      const original = productos.find(p => p.id === editId);
      await supabase.from('productos').update(payload).eq('id', editId);
      if (original && Number(original.precio_costo) !== Number(payload.precio_costo)) {
        await supabase.from('precios_historial').insert({ user_id: user!.id, producto_id: editId, precio_costo: payload.precio_costo, fuente: 'manual' });
      }
      toast.success('Actualizado');
    } else {
      const { data } = await supabase.from('productos').insert(payload).select('id').single();
      if (data && payload.precio_costo > 0) {
        await supabase.from('precios_historial').insert({ user_id: user!.id, producto_id: data.id, precio_costo: payload.precio_costo, fuente: 'manual' });
      }
      toast.success('Creado');
    }
    setOpen(false); load();
  }

  async function loadHistory() {
    const { data } = await supabase.from('stock_movimientos').select('*, productos(nombre)').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(50);
    setMovimientos((data as any) ?? []);
    setShowHistory(true);
  }

  async function submitAjuste() {
    if (!ajusteProducto || ajusteCantidad === 0) return;
    await supabase.from('productos').update({ stock_actual: ajusteProducto.stock_actual + ajusteCantidad }).eq('id', ajusteProducto.id);
    await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: ajusteProducto.id, tipo: 'ajuste', cantidad: ajusteCantidad, notas: 'Ajuste manual' });
    toast.success('Stock ajustado');
    setAjusteOpen(false); setAjusteCantidad(0); load();
  }

  async function confirmDeleteSingle() {
    if (!deleteSingleId) return;
    const { error } = await supabase.from('productos').delete().eq('id', deleteSingleId);
    if (error) { toast.error(error.message); return; }
    toast.success('Eliminado');
    setDeleteSingleId(null); load();
  }

  async function confirmDeleteMulti() {
    const ids = Array.from(selected);
    const { error } = await supabase.from('productos').delete().in('id', ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} eliminado(s)`);
    setSelected(new Set()); setSelectMode(false); setDeleteMultiConfirm(false); load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (selected.size === listaFiltrada.length) setSelected(new Set());
    else setSelected(new Set(listaFiltrada.map(p => p.id)));
  }

  const tipoLabel: Record<string, string> = { produccion: 'Producción', venta: 'Venta', retiro_duena: 'Retiro dueña', ajuste: 'Ajuste', perdida: 'Pérdida', consumo_interno: 'Consumo interno', otro: 'Otro', compra: 'Compra' };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex gap-2 flex-wrap">
          {esMateria
            ? <RegistrarCompra onDone={load} />
            : <><ImportarIA target="productos" onDone={load} /><ActualizarPrecios onDone={load} /></>}
          <Button variant="outline" size="sm" onClick={loadHistory}><History className="w-4 h-4 mr-1" /> Historial</Button>
          {!selectMode
            ? <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}><Trash2 className="w-4 h-4 mr-1" /> Seleccionar</Button>
            : <Button variant="destructive" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>Cancelar</Button>
          }
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
        </div>
      </div>

      {/* Pestañas */}
      <Tabs value={tab} onValueChange={v => setTab(v as TabKey)}>
        <TabsList className="grid grid-cols-3 h-auto w-full gap-1">
          {TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Buscar ${tabDef.singular}...`}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filtro por categoría (carne / vegetariano / vegano) */}
      {esVendible && catsPresentes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {[{ v: '', l: 'Todas' }, ...catsPresentes.map(c => ({ v: c, l: c === 'carne' ? 'Carne' : c === 'vegano' ? 'Vegano' : 'Vegetariano' }))].map(o => (
            <button
              key={o.v}
              onClick={() => setFiltroCat(o.v)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${filtroCat === o.v ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-accent'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}

      {/* Barra selección múltiple */}
      {selectMode && (
        <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected.size === listaFiltrada.length && listaFiltrada.length > 0} onCheckedChange={toggleSelectAll} />
            <span className="text-sm">{selected.size} seleccionado(s)</span>
          </div>
          <Button variant="destructive" size="sm" disabled={selected.size === 0} onClick={() => setDeleteMultiConfirm(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Eliminar seleccionados
          </Button>
        </div>
      )}

      {/* Modal nuevo/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} {tabDef.singular}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required /></div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stock actual</Label><Input type="number" step="0.001" value={form.stock_actual} onChange={e => setForm(f => ({ ...f, stock_actual: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Unidad</Label>
                <Select value={form.unidad_medida} onValueChange={v => setForm(f => ({ ...f, unidad_medida: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidad">Unidad</SelectItem>
                    <SelectItem value="porción">Porción</SelectItem>
                    <SelectItem value="paquete">Paquete</SelectItem>
                    <SelectItem value="maple">Maple</SelectItem>
                    <SelectItem value="docena">Docena</SelectItem>
                    <SelectItem value="1/2 docena">Media docena</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="g">Gramos</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Precio de costo</Label>
              <Input type="number" step="0.01" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: parseFloat(e.target.value) || 0 }))} />
              {historialPrecio.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Historial: {historialPrecio.map(h => `${formatCurrency(h.precio_costo)} (${formatDate(h.created_at.slice(0, 10))})`).join(' · ')}
                </p>
              )}
            </div>

            {esMateria && editId && historialCompras.length > 0 && (
              <div className="rounded-lg border p-3">
                <Label className="text-xs text-muted-foreground">Últimas compras</Label>
                <div className="mt-1 space-y-1">
                  {historialCompras.map(c => (
                    <div key={c.id} className="flex justify-between text-xs">
                      <span>{formatDate(c.fecha)} · {c.cantidad} {form.unidad_medida}{c.proveedor ? ` · ${c.proveedor}` : ''}</span>
                      <span className="text-muted-foreground">{formatCurrency(c.precio_unitario)}/u · {formatCurrency(c.precio_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {esMateria && (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <Label className="text-xs text-muted-foreground">¿Se usa en otra unidad al cocinar? (opcional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Select value={form.unidad_uso || 'ninguna'} onValueChange={v => setForm(f => {
                    const unidad_uso = v === 'ninguna' ? '' : v;
                    const fija = equivalenciaFija(f.unidad_medida, unidad_uso);
                    return { ...f, unidad_uso, equivalencia_uso: fija ?? f.equivalencia_uso };
                  })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Unidad de uso" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">No, es la misma</SelectItem>
                      <SelectItem value="unidad">Unidad</SelectItem>
                      <SelectItem value="g">Gramos</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.unidad_uso && (
                    <Input type="number" step="0.01" placeholder={`${form.unidad_medida} = ? ${form.unidad_uso}`} disabled={!!equivalenciaFija(form.unidad_medida, form.unidad_uso)}
                      value={form.equivalencia_uso || ''} onChange={e => setForm(f => ({ ...f, equivalencia_uso: parseFloat(e.target.value) || 0 }))} className="h-9" />
                  )}
                </div>
                {form.unidad_uso && form.equivalencia_uso > 0 && (
                  <p className="text-xs text-muted-foreground">1 {form.unidad_medida} = {form.equivalencia_uso} {form.unidad_uso}. Al registrar producción vas a poder anotar cuánto usaste en {form.unidad_uso}.</p>
                )}
              </div>
            )}

            {esVendible && (
              <div><Label>Grupo</Label>
                <Select value={form.linea} onValueChange={v => setForm(f => ({ ...f, linea: v as Linea }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LINEA_LABEL) as Linea[]).map(l => <SelectItem key={l} value={l}>{LINEA_LABEL[l]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!esMateria && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="fresco">Fresco</SelectItem><SelectItem value="congelado">Congelado</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Categoría</Label>
                    <Select value={form.categoria || 'ninguna'} onValueChange={v => setForm(f => ({ ...f, categoria: v === 'ninguna' ? '' : v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Sin categoría</SelectItem>
                        <SelectItem value="vegano">Vegano</SelectItem>
                        <SelectItem value="vegetariano">Vegetariano</SelectItem>
                        <SelectItem value="carne">Carne</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {esVendible && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Precio venta</Label><Input type="number" step="0.01" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))} disabled={!form.precio_venta_manual} /></div>
                  <div className="flex flex-col justify-end">
                    <div className="flex items-center gap-2 pb-1">
                      <Switch checked={!form.precio_venta_manual} onCheckedChange={v => setForm(f => ({ ...f, precio_venta_manual: !v }))} />
                      <Label className="text-xs">Por % ganancia</Label>
                    </div>
                  </div>
                </div>
                {!form.precio_venta_manual && <div><Label>% Ganancia</Label><Input type="number" step="0.1" value={form.porcentaje_ganancia} onChange={e => setForm(f => ({ ...f, porcentaje_ganancia: parseFloat(e.target.value) || 0 }))} /></div>}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Minutos por unidad</Label><Input type="number" step="0.5" value={form.minutos_por_unidad} onChange={e => setForm(f => ({ ...f, minutos_por_unidad: e.target.value }))} placeholder="opcional" /></div>
                  <div><Label className="text-xs">Packaging por unidad</Label><Input type="number" step="0.01" value={form.costo_packaging} onChange={e => setForm(f => ({ ...f, costo_packaging: e.target.value }))} placeholder="opcional" /></div>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">Para el cálculo de costos. Los minutos (horno + preparación) reemplazan el % de respaldo.</p>
              </>
            )}

            <div><Label>Alerta stock bajo</Label><Input type="number" step="0.1" value={form.alerta_stock_bajo} onChange={e => setForm(f => ({ ...f, alerta_stock_bajo: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} /><Label>Activo</Label></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar' : 'Crear'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal ajuste stock */}
      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar stock: {ajusteProducto?.nombre}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Stock actual: {ajusteProducto?.stock_actual} {ajusteProducto?.unidad_medida}</p>
          <div><Label>Cantidad a agregar (negativo para restar)</Label><Input type="number" step="0.001" value={ajusteCantidad} onChange={e => setAjusteCantidad(parseFloat(e.target.value) || 0)} /></div>
          <Button onClick={submitAjuste} className="w-full">Ajustar</Button>
        </DialogContent>
      </Dialog>

      {/* Historial */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Historial de movimientos</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {movimientos.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <p className="font-medium">{m.productos?.nombre}</p>
                  <p className="text-xs text-muted-foreground">{tipoLabel[m.tipo] ?? m.tipo} · {m.notas}</p>
                </div>
                <span className={m.cantidad > 0 ? 'text-primary font-medium' : 'text-destructive font-medium'}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmaciones borrar */}
      <AlertDialog open={!!deleteSingleId} onOpenChange={open => !open && setDeleteSingleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este producto?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el producto y todo su historial. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSingle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteMultiConfirm} onOpenChange={setDeleteMultiConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.size} producto(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMulti} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar todo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lista */}
      <div className="space-y-2">
        {listaFiltrada.map(p => (
          <div key={p.id} className={`bg-card rounded-lg border p-3 flex items-center gap-3 ${!p.activo ? 'opacity-50' : ''} ${selectMode && selected.has(p.id) ? 'border-destructive bg-destructive/5' : ''}`}>
            {selectMode && <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{p.nombre}</p>
                {!esMateria && <Badge variant={p.tipo === 'fresco' ? 'default' : 'secondary'} className="text-xs">{p.tipo}</Badge>}
                {p.categoria && <Badge variant="outline" className="text-xs">{p.categoria === 'carne' ? 'Carne' : p.categoria === 'vegano' ? 'Vegano' : 'Veggie'}</Badge>}
                {p.stock_actual <= p.alerta_stock_bajo && p.activo && <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Stock bajo</Badge>}
                {!p.activo && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Costo: {formatCurrency(p.precio_costo)}
                {esVendible && ` · Venta: ${formatCurrency(p.precio_venta)}`}
                {' · '}Stock: {p.stock_actual} {p.unidad_medida}
                {p.unidad_uso && p.equivalencia_uso ? ` (1 ${p.unidad_medida} = ${p.equivalencia_uso} ${p.unidad_uso})` : ''}
              </p>
            </div>
            {!selectMode && (
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setAjusteProducto(p); setAjusteOpen(true); }}>Stock</Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteSingleId(p.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        ))}
        {listaFiltrada.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            {busqueda ? 'No se encontraron resultados' : `No hay ${tabDef.singular} cargados`}
          </p>
        )}
      </div>
    </div>
  );
}
