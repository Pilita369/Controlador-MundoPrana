import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingBag, Search } from 'lucide-react';
import { toast } from 'sonner';
import { registrarCompra } from '@/lib/compras';

interface MateriaLite { id: string; nombre: string; unidad_medida: string; precio_costo: number; stock_actual: number; }

export default function RegistrarCompra({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [materias, setMaterias] = useState<MateriaLite[]>([]);
  const [buscar, setBuscar] = useState('');
  const [sel, setSel] = useState<MateriaLite | null>(null);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    cantidad: '', modoPrecio: 'total' as 'total' | 'unitario', valor: '',
    proveedor: '', comoGasto: true, medioPago: 'efectivo',
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setSel(null); setBuscar('');
    setForm({ fecha: new Date().toISOString().split('T')[0], cantidad: '', modoPrecio: 'total', valor: '', proveedor: '', comoGasto: true, medioPago: 'efectivo' });
    supabase.from('productos').select('id, nombre, unidad_medida, precio_costo, stock_actual')
      .match({ user_id: user.id, clase: 'materia_prima', activo: true }).order('nombre')
      .then(({ data }) => setMaterias((data as any) ?? []));
  }, [open, user]);

  const cantidad = parseFloat(form.cantidad) || 0;
  const valor = parseFloat(form.valor) || 0;
  const precioUnitario = form.modoPrecio === 'unitario' ? valor : (cantidad > 0 ? valor / cantidad : 0);
  const precioTotal = form.modoPrecio === 'total' ? valor : valor * cantidad;

  async function confirmar() {
    if (!user || !sel) { toast.error('Elegí la materia prima'); return; }
    if (cantidad <= 0 || valor <= 0) { toast.error('Completá cantidad y precio'); return; }
    setGuardando(true);
    try {
      await registrarCompra({
        userId: user.id, productoId: sel.id, productoNombre: sel.nombre,
        fecha: form.fecha, cantidad, precioUnitario,
        proveedor: form.proveedor.trim() || undefined,
        comoGasto: form.comoGasto, medioPago: form.medioPago,
      });
      toast.success(`Compra registrada · stock ${sel.nombre}: ${sel.stock_actual + cantidad} ${sel.unidad_medida}`);
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo registrar');
    } finally {
      setGuardando(false);
    }
  }

  const filtradas = materias.filter(m => m.nombre.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <ShoppingBag className="w-4 h-4 mr-1" /> Registrar compra
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar compra de materia prima</DialogTitle>
            <DialogDescription>Sube el stock, actualiza el costo y guarda el historial de compras.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Materia prima</Label>
              {sel ? (
                <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <span className="font-medium">{sel.nombre}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSel(null)}>Cambiar</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar ingrediente..." value={buscar} onChange={e => setBuscar(e.target.value)} className="pl-9" />
                  {buscar && (
                    <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto mt-1">
                      {filtradas.slice(0, 8).map(m => (
                        <button key={m.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                          onClick={() => setSel(m)}>
                          <span>{m.nombre}</span>
                          <span className="text-xs text-muted-foreground">stock {m.stock_actual} {m.unidad_medida}</span>
                        </button>
                      ))}
                      {filtradas.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados. Creala primero en Materia prima.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cantidad{sel ? ` (${sel.unidad_medida})` : ''}</Label>
                <Input type="number" step="0.001" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
              </div>
              <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
            </div>

            <div className="space-y-1">
              <Label>Precio</Label>
              <div className="flex gap-2">
                <Select value={form.modoPrecio} onValueChange={(v: 'total' | 'unitario') => setForm(f => ({ ...f, modoPrecio: v }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="unitario">Por unidad</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className="flex-1" placeholder={form.modoPrecio === 'total' ? 'Lo que pagaste' : `Por ${sel?.unidad_medida ?? 'unidad'}`} />
              </div>
              {cantidad > 0 && valor > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(precioUnitario)} por {sel?.unidad_medida ?? 'unidad'} · total {formatCurrency(precioTotal)}
                  {sel && sel.precio_costo > 0 && ` · costo anterior ${formatCurrency(sel.precio_costo)}`}
                </p>
              )}
            </div>

            <div><Label>Proveedor (opcional)</Label><Input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Ej: Mayorista del centro" /></div>

            <div className="flex items-center gap-2">
              <Checkbox checked={form.comoGasto} onCheckedChange={v => setForm(f => ({ ...f, comoGasto: !!v }))} />
              <Label className="text-sm font-normal">Registrarlo también como gasto del negocio</Label>
            </div>
            {form.comoGasto && (
              <div><Label>Medio de pago</Label>
                <Select value={form.medioPago} onValueChange={v => setForm(f => ({ ...f, medioPago: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button className="w-full" onClick={confirmar} disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar compra'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
