import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Download, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Producto { id: string; nombre: string; precio_venta: number; stock_actual: number; }
interface Venta { id: string; fecha: string; cantidad: number; precio_unitario: number; total: number; medio_cobro: string; productos: { nombre: string } | null; }

export default function Ventas() {
  const { user } = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ producto_id: '', cantidad: 1, precio_unitario: 0, medio_cobro: 'efectivo', fecha: new Date().toISOString().split('T')[0] });

  useEffect(() => { if (user) { load(); loadProductos(); } }, [user]);

  async function load() {
    const { data } = await supabase.from('ventas').select('*, productos(nombre)').eq('user_id', user!.id).order('fecha', { ascending: false });
    setVentas((data as any) ?? []);
  }

  async function loadProductos() {
    const { data } = await supabase.from('productos').select('id, nombre, precio_venta, stock_actual').eq('user_id', user!.id).eq('activo', true);
    setProductos(data ?? []);
  }

  function onProductoChange(id: string) {
    const p = productos.find(x => x.id === id);
    setForm(f => ({ ...f, producto_id: id, precio_unitario: p?.precio_venta ?? 0 }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const total = form.cantidad * form.precio_unitario;
    const { error } = await supabase.from('ventas').insert({
      user_id: user!.id, producto_id: form.producto_id, fecha: form.fecha,
      cantidad: form.cantidad, precio_unitario: form.precio_unitario, total, medio_cobro: form.medio_cobro,
    });
    if (error) { toast.error(error.message); return; }

    // Descontar stock
    const prod = productos.find(p => p.id === form.producto_id);
    if (prod) {
      await supabase.from('productos').update({ stock_actual: prod.stock_actual - form.cantidad }).eq('id', prod.id);
      await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: prod.id, tipo: 'venta', cantidad: -form.cantidad, notas: 'Venta registrada' });
    }

    toast.success('Venta registrada');
    setOpen(false);
    setForm({ producto_id: '', cantidad: 1, precio_unitario: 0, medio_cobro: 'efectivo', fecha: new Date().toISOString().split('T')[0] });
    load();
    loadProductos();
  }

  const filtered = ventas.filter(v => (v.productos?.nombre ?? '').toLowerCase().includes(search.toLowerCase()));
  const totalVentas = filtered.reduce((s, v) => s + Number(v.total), 0);
  const byMedio: Record<string, number> = {};
  filtered.forEach(v => { byMedio[v.medio_cobro] = (byMedio[v.medio_cobro] ?? 0) + Number(v.total); });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar venta</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><Label>Producto</Label>
                <Select value={form.producto_id} onValueChange={onProductoChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                  <SelectContent>{productos.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_actual})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cantidad</Label><Input type="number" min={1} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))} /></div>
                <div><Label>Precio unit.</Label><Input type="number" step="0.01" value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="text-sm text-muted-foreground">Total: {formatCurrency(form.cantidad * form.precio_unitario)}</div>
              <div><Label>Medio de cobro</Label>
                <Select value={form.medio_cobro} onValueChange={v => setForm(f => ({ ...f, medio_cobro: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Registrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered.map(v => ({ Fecha: v.fecha, Producto: v.productos?.nombre, Cantidad: v.cantidad, 'Precio Unit': v.precio_unitario, Total: v.total, Medio: v.medio_cobro })), 'ventas')}><Download className="w-4 h-4" /></Button>
      </div>

      <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-4 text-sm">
        <span className="font-medium">Total: {formatCurrency(totalVentas)}</span>
        {Object.entries(byMedio).map(([k, v]) => <span key={k} className="text-muted-foreground">{k}: {formatCurrency(v)}</span>)}
      </div>

      <div className="space-y-2">
        {filtered.map(v => (
          <div key={v.id} className="bg-card rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{v.productos?.nombre}</p>
              <p className="text-xs text-muted-foreground">{formatDate(v.fecha)} · {v.cantidad} × {formatCurrency(Number(v.precio_unitario))} · {v.medio_cobro}</p>
            </div>
            <p className="font-semibold text-sm">{formatCurrency(Number(v.total))}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay ventas registradas</p>}
      </div>
    </div>
  );
}
