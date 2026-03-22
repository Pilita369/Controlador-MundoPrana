import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Download, Search, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface Producto { id: string; nombre: string; precio_venta: number; stock_actual: number; }
interface Venta { id: string; fecha: string; cantidad: number; precio_unitario: number; total: number; medio_cobro: string; producto_id: string; productos: { nombre: string } | null; }

const emptyForm = { producto_id: '', cantidad: 1, precio_unitario: 0, medio_cobro: 'efectivo', fecha: new Date().toISOString().split('T')[0] };

export default function Ventas() {
  const { user } = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buscarProducto, setBuscarProducto] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (user) { load(); loadProductos(); } }, [user]);

  async function load() {
    const { data } = await supabase.from('ventas').select('*, productos(nombre)').eq('user_id', user!.id).order('fecha', { ascending: false });
    setVentas((data as any) ?? []);
  }

  async function loadProductos() {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, precio_venta, stock_actual')
      .match({ user_id: user!.id, activo: true, es_materia_prima: false });
    if (!error) setProductos((data as unknown as Producto[]) ?? []);
  }

  // Productos filtrados por búsqueda dentro del formulario
  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(buscarProducto.toLowerCase())
  );

  function onProductoChange(id: string) {
    const p = productos.find(x => x.id === id);
    setForm(f => ({ ...f, producto_id: id, precio_unitario: p?.precio_venta ?? 0 }));
    setBuscarProducto(p?.nombre ?? '');
  }

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setBuscarProducto('');
    setOpen(true);
  }

  function openEdit(v: Venta) {
    setEditId(v.id);
    setForm({ producto_id: v.producto_id, cantidad: v.cantidad, precio_unitario: Number(v.precio_unitario), medio_cobro: v.medio_cobro, fecha: v.fecha });
    setBuscarProducto(v.productos?.nombre ?? '');
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.producto_id) { toast.error('Seleccioná un producto'); return; }
    const total = form.cantidad * form.precio_unitario;

    if (editId) {
      const { error } = await supabase.from('ventas').update({
        fecha: form.fecha, producto_id: form.producto_id,
        cantidad: form.cantidad, precio_unitario: form.precio_unitario,
        total, medio_cobro: form.medio_cobro,
      }).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Venta actualizada');
    } else {
      const { error } = await supabase.from('ventas').insert({
        user_id: user!.id, producto_id: form.producto_id, fecha: form.fecha,
        cantidad: form.cantidad, precio_unitario: form.precio_unitario, total, medio_cobro: form.medio_cobro,
      });
      if (error) { toast.error(error.message); return; }
      const prod = productos.find(p => p.id === form.producto_id);
      if (prod) {
        await supabase.from('productos').update({ stock_actual: prod.stock_actual - form.cantidad }).eq('id', prod.id);
        await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: prod.id, tipo: 'venta', cantidad: -form.cantidad, notas: 'Venta registrada' });
      }
      toast.success('Venta registrada');
    }

    setOpen(false); setForm(emptyForm); setBuscarProducto('');
    load(); loadProductos();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('ventas').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Venta eliminada');
    setDeleteId(null); load();
  }

  const filtered = ventas.filter(v => (v.productos?.nombre ?? '').toLowerCase().includes(search.toLowerCase()));
  const totalVentas = filtered.reduce((s, v) => s + Number(v.total), 0);
  const byMedio: Record<string, number> = {};
  filtered.forEach(v => { byMedio[v.medio_cobro] = (byMedio[v.medio_cobro] ?? 0) + Number(v.total); });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nueva</Button>
      </div>

      {/* Modal nueva/editar venta */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditId(null); setBuscarProducto(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar venta' : 'Registrar venta'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>

            {/* Selector de producto con buscador */}
            <div className="space-y-1">
              <Label>Producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={buscarProducto}
                  onChange={e => { setBuscarProducto(e.target.value); setForm(f => ({ ...f, producto_id: '' })); }}
                  className="pl-9"
                />
              </div>
              {buscarProducto && !form.producto_id && productosFiltrados.length > 0 && (
                <div className="border rounded-md bg-card shadow-sm max-h-48 overflow-y-auto">
                  {productosFiltrados.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center"
                      onClick={() => onProductoChange(p.id)}
                    >
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground">stock: {p.stock_actual} · {formatCurrency(p.precio_venta)}</span>
                    </button>
                  ))}
                </div>
              )}
              {buscarProducto && !form.producto_id && productosFiltrados.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No se encontraron productos</p>
              )}
              {form.producto_id && (
                <p className="text-xs text-primary px-1">✓ {productos.find(p => p.id === form.producto_id)?.nombre}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cantidad</Label><Input type="number" min={1} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))} /></div>
              <div><Label>Precio unit.</Label><Input type="number" step="0.01" value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="text-sm font-medium">Total: {formatCurrency(form.cantidad * form.precio_unitario)}</div>
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
            <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Registrar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrar */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Buscador lista ventas */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar en ventas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered.map(v => ({ Fecha: v.fecha, Producto: v.productos?.nombre, Cantidad: v.cantidad, 'Precio Unit': v.precio_unitario, Total: v.total, Medio: v.medio_cobro })), 'ventas')}>
          <Download className="w-4 h-4" />
        </Button>
      </div>

      <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-4 text-sm">
        <span className="font-medium">Total: {formatCurrency(totalVentas)}</span>
        {Object.entries(byMedio).map(([k, v]) => <span key={k} className="text-muted-foreground">{k}: {formatCurrency(v)}</span>)}
      </div>

      <div className="space-y-2">
        {filtered.map(v => (
          <div key={v.id} className="bg-card rounded-lg border p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{v.productos?.nombre}</p>
              <p className="text-xs text-muted-foreground">{formatDate(v.fecha)} · {v.cantidad} × {formatCurrency(Number(v.precio_unitario))} · {v.medio_cobro}</p>
            </div>
            <p className="font-semibold text-sm shrink-0">{formatCurrency(Number(v.total))}</p>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => openEdit(v)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(v.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay ventas registradas</p>}
      </div>
    </div>
  );
}