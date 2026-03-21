import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, AlertTriangle, History } from 'lucide-react';
import { toast } from 'sonner';

interface Producto {
  id: string; nombre: string; tipo: string; precio_costo: number; precio_venta: number;
  porcentaje_ganancia: number | null; precio_venta_manual: boolean; stock_actual: number;
  unidad_medida: string; alerta_stock_bajo: number; activo: boolean;
}
interface Movimiento { id: string; tipo: string; cantidad: number; notas: string | null; created_at: string; productos: { nombre: string } | null; }

const defaultForm = { nombre: '', tipo: 'fresco', precio_costo: 0, precio_venta: 0, porcentaje_ganancia: 0, precio_venta_manual: true, stock_actual: 0, unidad_medida: 'unidad', alerta_stock_bajo: 5, activo: true };

export default function Productos() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [showHistory, setShowHistory] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteProducto, setAjusteProducto] = useState<Producto | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState(0);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data } = await supabase.from('productos').select('*').eq('user_id', user!.id).order('nombre');
    setProductos(data ?? []);
  }

  function openEdit(p: Producto) {
    setEditId(p.id);
    setForm({ nombre: p.nombre, tipo: p.tipo, precio_costo: p.precio_costo, precio_venta: p.precio_venta, porcentaje_ganancia: p.porcentaje_ganancia ?? 0, precio_venta_manual: p.precio_venta_manual, stock_actual: p.stock_actual, unidad_medida: p.unidad_medida, alerta_stock_bajo: p.alerta_stock_bajo, activo: p.activo });
    setOpen(true);
  }

  function openNew() { setEditId(null); setForm(defaultForm); setOpen(true); }

  function calcPrecioSugerido() {
    if (!form.precio_venta_manual && form.porcentaje_ganancia > 0) {
      const sugerido = form.precio_costo * (1 + form.porcentaje_ganancia / 100);
      setForm(f => ({ ...f, precio_venta: Math.round(sugerido * 100) / 100 }));
    }
  }

  useEffect(() => { calcPrecioSugerido(); }, [form.precio_costo, form.porcentaje_ganancia, form.precio_venta_manual]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, user_id: user!.id, porcentaje_ganancia: form.precio_venta_manual ? null : form.porcentaje_ganancia };
    if (editId) {
      await supabase.from('productos').update(payload).eq('id', editId);
      toast.success('Producto actualizado');
    } else {
      await supabase.from('productos').insert(payload);
      toast.success('Producto creado');
    }
    setOpen(false);
    load();
  }

  async function loadHistory() {
    const { data } = await supabase.from('stock_movimientos').select('*, productos(nombre)').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(50);
    setMovimientos((data as any) ?? []);
    setShowHistory(true);
  }

  async function submitAjuste() {
    if (!ajusteProducto || ajusteCantidad === 0) return;
    await supabase.from('productos').update({ stock_actual: ajusteProducto.stock_actual + ajusteCantidad }).eq('id', ajusteProducto.id);
    await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: ajusteProducto.id, tipo: ajusteCantidad > 0 ? 'produccion' : 'ajuste', cantidad: ajusteCantidad, notas: 'Ajuste manual' });
    toast.success('Stock ajustado');
    setAjusteOpen(false);
    setAjusteCantidad(0);
    load();
  }

  const tipoLabel: Record<string, string> = { produccion: 'Producción', venta: 'Venta', retiro_duena: 'Retiro dueña', ajuste: 'Ajuste' };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadHistory}><History className="w-4 h-4 mr-1" /> Historial</Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} producto</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fresco">Fresco</SelectItem><SelectItem value="congelado">Congelado</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Precio costo</Label><Input type="number" step="0.01" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Precio venta</Label><Input type="number" step="0.01" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))} disabled={!form.precio_venta_manual} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!form.precio_venta_manual} onCheckedChange={v => setForm(f => ({ ...f, precio_venta_manual: !v }))} />
              <Label className="text-sm">Calcular precio por % ganancia</Label>
            </div>
            {!form.precio_venta_manual && <div><Label>% Ganancia</Label><Input type="number" step="0.1" value={form.porcentaje_ganancia} onChange={e => setForm(f => ({ ...f, porcentaje_ganancia: parseFloat(e.target.value) || 0 }))} /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stock</Label><Input type="number" value={form.stock_actual} onChange={e => setForm(f => ({ ...f, stock_actual: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Unidad</Label>
                <Select value={form.unidad_medida} onValueChange={v => setForm(f => ({ ...f, unidad_medida: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="unidad">Unidad</SelectItem><SelectItem value="porción">Porción</SelectItem><SelectItem value="paquete">Paquete</SelectItem><SelectItem value="kg">Kg</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Alerta stock bajo</Label><Input type="number" value={form.alerta_stock_bajo} onChange={e => setForm(f => ({ ...f, alerta_stock_bajo: parseInt(e.target.value) || 0 }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} /><Label>Activo</Label></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar' : 'Crear'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar stock: {ajusteProducto?.nombre}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Stock actual: {ajusteProducto?.stock_actual}</p>
          <div><Label>Cantidad a agregar (negativo para restar)</Label><Input type="number" value={ajusteCantidad} onChange={e => setAjusteCantidad(parseInt(e.target.value) || 0)} /></div>
          <Button onClick={submitAjuste} className="w-full">Ajustar</Button>
        </DialogContent>
      </Dialog>

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

      <div className="space-y-2">
        {productos.map(p => (
          <div key={p.id} className={`bg-card rounded-lg border p-3 flex items-center justify-between ${!p.activo ? 'opacity-50' : ''}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{p.nombre}</p>
                <Badge variant={p.tipo === 'fresco' ? 'default' : 'secondary'} className="text-xs">{p.tipo}</Badge>
                {p.stock_actual <= p.alerta_stock_bajo && p.activo && <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Stock bajo</Badge>}
                {!p.activo && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Costo: {formatCurrency(p.precio_costo)} · Venta: {formatCurrency(p.precio_venta)} · Stock: {p.stock_actual} {p.unidad_medida}</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => { setAjusteProducto(p); setAjusteOpen(true); }}>Stock</Button>
              <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
