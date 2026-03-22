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
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import MetricCard from '@/components/MetricCard';
import { Plus, Download, Wallet, Package, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface Producto { id: string; nombre: string; precio_costo: number; stock_actual: number; }
interface Retiro { id: string; fecha: string; tipo: string; monto: number; medio_pago: string | null; cantidad_producto: number | null; notas: string | null; producto_id: string | null; productos: { nombre: string } | null; }

const emptyDinero = { fecha: new Date().toISOString().split('T')[0], monto: 0, medio_pago: 'efectivo', notas: '' };
const emptyEspecie = { fecha: new Date().toISOString().split('T')[0], producto_id: '', cantidad: 1, notas: '' };

export default function Sueldo() {
  const { user } = useAuth();
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [meta, setMeta] = useState(300000);
  const [openDinero, setOpenDinero] = useState(false);
  const [openEspecie, setOpenEspecie] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState<string>('dinero');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formDinero, setFormDinero] = useState(emptyDinero);
  const [formEspecie, setFormEspecie] = useState(emptyEspecie);

  useEffect(() => { if (user) { load(); loadProductos(); loadMeta(); } }, [user]);

  async function load() {
    const { data } = await supabase.from('sueldo_retiros').select('*, productos(nombre)').eq('user_id', user!.id).order('fecha', { ascending: false });
    setRetiros((data as any) ?? []);
  }
  async function loadProductos() {
    const { data } = await supabase.from('productos').select('id, nombre, precio_costo, stock_actual').eq('user_id', user!.id).eq('activo', true);
    setProductos(data ?? []);
  }
  async function loadMeta() {
    const { data } = await supabase.from('ajustes_usuario').select('meta_sueldo_mensual').eq('user_id', user!.id).single();
    if (data) setMeta(data.meta_sueldo_mensual);
  }

  function openEditRetiro(r: Retiro) {
    setEditId(r.id);
    setEditTipo(r.tipo);
    if (r.tipo === 'dinero') {
      setFormDinero({ fecha: r.fecha, monto: Number(r.monto), medio_pago: r.medio_pago ?? 'efectivo', notas: r.notas ?? '' });
      setOpenDinero(true);
    } else {
      setFormEspecie({ fecha: r.fecha, producto_id: r.producto_id ?? '', cantidad: r.cantidad_producto ?? 1, notas: r.notas ?? '' });
      setOpenEspecie(true);
    }
  }

  function openNewDinero() { setEditId(null); setFormDinero(emptyDinero); setOpenDinero(true); }
  function openNewEspecie() { setEditId(null); setFormEspecie(emptyEspecie); setOpenEspecie(true); }

  async function submitDinero(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      await supabase.from('sueldo_retiros').update({ fecha: formDinero.fecha, monto: formDinero.monto, medio_pago: formDinero.medio_pago, notas: formDinero.notas || null }).eq('id', editId);
      toast.success('Retiro actualizado');
    } else {
      await supabase.from('sueldo_retiros').insert({ user_id: user!.id, tipo: 'dinero', fecha: formDinero.fecha, monto: formDinero.monto, medio_pago: formDinero.medio_pago, notas: formDinero.notas || null });
      toast.success('Retiro registrado');
    }
    setOpenDinero(false); load();
  }

  async function submitEspecie(e: React.FormEvent) {
    e.preventDefault();
    const prod = productos.find(p => p.id === formEspecie.producto_id);
    if (!prod) return;
    const monto = prod.precio_costo * formEspecie.cantidad;
    if (editId) {
      await supabase.from('sueldo_retiros').update({ fecha: formEspecie.fecha, monto, producto_id: prod.id, cantidad_producto: formEspecie.cantidad, notas: formEspecie.notas || null }).eq('id', editId);
      toast.success('Retiro actualizado');
    } else {
      await supabase.from('sueldo_retiros').insert({ user_id: user!.id, tipo: 'especie', fecha: formEspecie.fecha, monto, producto_id: prod.id, cantidad_producto: formEspecie.cantidad, notas: formEspecie.notas || null });
      await supabase.from('productos').update({ stock_actual: prod.stock_actual - formEspecie.cantidad }).eq('id', prod.id);
      await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: prod.id, tipo: 'retiro_duena', cantidad: -formEspecie.cantidad, notas: 'Retiro en especie' });
      toast.success('Retiro en especie registrado');
    }
    setOpenEspecie(false); load(); loadProductos();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('sueldo_retiros').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Retiro eliminado');
    setDeleteId(null); load();
  }

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthRetiros = retiros.filter(r => r.fecha >= startOfMonth);
  const sueldoDinero = monthRetiros.filter(r => r.tipo === 'dinero').reduce((s, r) => s + Number(r.monto), 0);
  const sueldoEspecie = monthRetiros.filter(r => r.tipo === 'especie').reduce((s, r) => s + Number(r.monto), 0);
  const total = sueldoDinero + sueldoEspecie;
  const progreso = meta > 0 ? Math.min((total / meta) * 100, 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mi Sueldo</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openNewDinero}><Wallet className="w-4 h-4 mr-1" /> Dinero</Button>
          <Button size="sm" onClick={openNewEspecie}><Package className="w-4 h-4 mr-1" /> Especie</Button>
        </div>
      </div>

      {/* Modal Dinero */}
      <Dialog open={openDinero} onOpenChange={v => { setOpenDinero(v); if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar retiro en dinero' : 'Retiro en dinero'}</DialogTitle></DialogHeader>
          <form onSubmit={submitDinero} className="space-y-3">
            <div><Label>Fecha</Label><Input type="date" value={formDinero.fecha} onChange={e => setFormDinero(f => ({ ...f, fecha: e.target.value }))} /></div>
            <div><Label>Monto</Label><Input type="number" step="0.01" value={formDinero.monto} onChange={e => setFormDinero(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))} required /></div>
            <div><Label>Medio de pago</Label>
              <Select value={formDinero.medio_pago} onValueChange={v => setFormDinero(f => ({ ...f, medio_pago: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea value={formDinero.notas} onChange={e => setFormDinero(f => ({ ...f, notas: e.target.value }))} /></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Registrar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Especie */}
      <Dialog open={openEspecie} onOpenChange={v => { setOpenEspecie(v); if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar retiro en especie' : 'Retiro en especie'}</DialogTitle></DialogHeader>
          <form onSubmit={submitEspecie} className="space-y-3">
            <div><Label>Fecha</Label><Input type="date" value={formEspecie.fecha} onChange={e => setFormEspecie(f => ({ ...f, fecha: e.target.value }))} /></div>
            <div><Label>Producto</Label>
              <Select value={formEspecie.producto_id} onValueChange={v => setFormEspecie(f => ({ ...f, producto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{productos.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_actual})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad</Label><Input type="number" min={1} value={formEspecie.cantidad} onChange={e => setFormEspecie(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))} /></div>
            {formEspecie.producto_id && <p className="text-sm text-muted-foreground">Valor al costo: {formatCurrency((productos.find(p => p.id === formEspecie.producto_id)?.precio_costo ?? 0) * formEspecie.cantidad)}</p>}
            <div><Label>Notas</Label><Textarea value={formEspecie.notas} onChange={e => setFormEspecie(f => ({ ...f, notas: e.target.value }))} /></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Registrar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación borrar */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este retiro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard title="Dinero" value={formatCurrency(sueldoDinero)} />
        <MetricCard title="Especie" value={formatCurrency(sueldoEspecie)} />
        <MetricCard title="Total" value={formatCurrency(total)} />
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Meta mensual</span>
          <span className="font-medium">{formatCurrency(total)} / {formatCurrency(meta)}</span>
        </div>
        <Progress value={progreso} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">{progreso.toFixed(0)}%</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Historial</h2>
        <Button variant="outline" size="sm" onClick={() => exportToCSV(retiros.map(r => ({ Fecha: r.fecha, Tipo: r.tipo, Monto: r.monto, Producto: r.productos?.nombre, Cantidad: r.cantidad_producto, Notas: r.notas })), 'sueldo')}><Download className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-2">
        {retiros.map(r => (
          <div key={r.id} className="bg-card rounded-lg border p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{r.tipo === 'dinero' ? 'Retiro en dinero' : `${r.productos?.nombre} (×${r.cantidad_producto})`}</p>
              <p className="text-xs text-muted-foreground">{formatDate(r.fecha)} · {r.tipo === 'dinero' ? r.medio_pago : 'mercadería'}{r.notas ? ` · ${r.notas}` : ''}</p>
            </div>
            <p className="font-semibold text-sm shrink-0">{formatCurrency(Number(r.monto))}</p>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => openEditRetiro(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(r.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
        {retiros.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay retiros registrados</p>}
      </div>
    </div>
  );
}