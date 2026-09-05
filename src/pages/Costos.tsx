import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  cargarConfigCostos, calcularCostos, LABEL_NIVEL_COSTO,
  type ConfigCostos, type DesgloseCostos,
} from '@/lib/costos';

interface ProductoCosto {
  id: string; nombre: string; linea: string; categoria: string | null;
  precio_costo: number; precio_venta: number; costo_packaging: number | null;
  minutos_por_unidad: number | null;
}

const LINEA_LABEL: Record<string, string> = { congelados: 'Congelados', carta_fija: 'Carta fija', menu_dia: 'Menú del día', reventa: 'Productos' };

function colorMargen(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct < 20) return 'text-destructive';
  if (pct < 35) return 'text-amber-600';
  return 'text-primary';
}

export default function Costos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<ConfigCostos | null>(null);
  const [productos, setProductos] = useState<ProductoCosto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroLinea, setFiltroLinea] = useState('todos');
  const [sel, setSel] = useState<ProductoCosto | null>(null);
  const [edit, setEdit] = useState({ minutos_por_unidad: '', costo_packaging: '' });

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const [c, p] = await Promise.all([
      cargarConfigCostos(user!.id),
      supabase.from('productos').select('id, nombre, linea, categoria, precio_costo, precio_venta, costo_packaging, minutos_por_unidad')
        .match({ user_id: user!.id, clase: 'elaborado', activo: true }).order('nombre'),
    ]);
    setCfg(c);
    setProductos((p.data as any) ?? []);
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

  function abrir(p: ProductoCosto) {
    setSel(p);
    setEdit({
      minutos_por_unidad: p.minutos_por_unidad != null ? String(p.minutos_por_unidad) : '',
      costo_packaging: p.costo_packaging != null ? String(p.costo_packaging) : '',
    });
  }

  async function guardarEdit() {
    if (!sel) return;
    const { error } = await supabase.from('productos').update({
      minutos_por_unidad: edit.minutos_por_unidad ? parseFloat(edit.minutos_por_unidad) : null,
      costo_packaging: edit.costo_packaging ? parseFloat(edit.costo_packaging) : null,
    }).eq('id', sel.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Guardado');
    setSel(null); load();
  }

  async function usarSugerido(p: ProductoCosto, sugerido: number) {
    const { error } = await supabase.from('productos').update({ precio_venta: sugerido, precio_venta_manual: true }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Precio de ${p.nombre}: ${formatCurrency(sugerido)}`);
    load();
  }

  const selDesglose = sel && cfg ? calcularCostos(sel, cfg) : null;

  const revisar = filas.filter(f => f.d.margenPct != null && f.d.margenPct < 20).length;
  const sinCalcular = filas.filter(f => f.d.nivel === 'sin_calcular').length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Costos</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/ajustes')}><Settings2 className="w-4 h-4 mr-1" /> Configuración</Button>
      </div>

      {cfg && (
        <p className="text-xs text-muted-foreground">
          Menores {cfg.menores_pct}% · respaldo productivo {cfg.fallback_productivo_pct}% · markup sugerido {cfg.markup_default}%
        </p>
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
          </button>
        ))}
        {filas.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Sin productos</p>}
      </div>

      {/* Detalle / edición */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{sel?.nombre}</DialogTitle></DialogHeader>
          {selDesglose && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <Fila l="Ingredientes" v={selDesglose.ingredientes} />
                <Fila l={`Menores (${cfg?.menores_pct}%)`} v={selDesglose.menores} />
                {selDesglose.packaging > 0 && <Fila l="Packaging" v={selDesglose.packaging} />}
                <div className="flex justify-between font-medium border-t pt-1"><span>Costo directo</span><span>{formatCurrency(selDesglose.costoDirecto)}</span></div>
                <Fila l={selDesglose.productivoEsFallback ? `Productivo (respaldo ${cfg?.fallback_productivo_pct}%)` : 'Productivo (gas/luz/mano de obra)'} v={selDesglose.productivoExtra} />
                <div className="flex justify-between font-semibold border-t pt-1"><span>Costo productivo</span><span>{formatCurrency(selDesglose.costoProductivo)}</span></div>
                <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Precio de venta</span><span>{selDesglose.precioVenta > 0 ? formatCurrency(selDesglose.precioVenta) : '—'}</span></div>
                <div className="flex justify-between font-medium"><span>Margen</span><span className={colorMargen(selDesglose.margenPct)}>{selDesglose.margen != null ? `${formatCurrency(selDesglose.margen)} · ${selDesglose.margenPct!.toFixed(0)}%` : 'sin datos'}</span></div>
                {selDesglose.precioSugerido != null && (
                  <div className="flex justify-between items-center border-t pt-1">
                    <span className="text-muted-foreground">Precio sugerido</span>
                    <span className="flex items-center gap-2">{formatCurrency(selDesglose.precioSugerido)}
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { usarSugerido(sel!, selDesglose.precioSugerido!); setSel(null); }}>Usar</Button>
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Minutos por unidad</Label>
                  <Input type="number" step="0.5" value={edit.minutos_por_unidad} onChange={e => setEdit(f => ({ ...f, minutos_por_unidad: e.target.value }))} placeholder="opcional" />
                </div>
                <div><Label className="text-xs">Packaging por unidad</Label>
                  <Input type="number" step="0.01" value={edit.costo_packaging} onChange={e => setEdit(f => ({ ...f, costo_packaging: e.target.value }))} placeholder="opcional" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Si cargás los minutos, el costo productivo se calcula con gas/luz y mano de obra en vez del % de respaldo. El costo de ingredientes se ajusta desde Producción o editando el producto.</p>
              <Button className="w-full" onClick={guardarEdit}>Guardar</Button>
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
