import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import MesSelector, { inicioMes, rangoMes } from '@/components/MesSelector';
import { CATEGORIAS_MOVIMIENTO, CATEGORIA_MOV_LABEL, CUENTAS, sugerirCategoriaFacu } from '@/lib/categoriasMovimiento';
import { Plus, Trash2, Edit2, Download, Link2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Movimiento {
  id: string;
  fecha: string | null;
  direccion: string;
  monto: number;
  contraparte_nombre: string | null;
  categoria: string;
  subcategoria: string | null;
  medio_pago: string | null;
  cuenta: string | null;
  estado_confirmacion: string;
  afecta_caja: boolean;
  afecta_resultado: boolean;
  linked_transfer_id: string | null;
  notas: string | null;
}

const emptyForm = {
  fecha: new Date().toISOString().split('T')[0],
  direccion: 'salida' as 'entrada' | 'salida',
  monto: 0,
  contraparte_nombre: '',
  categoriaKey: '', // índice compuesto "categoria|label" para ubicar la opción elegida
  categoriaLibre: '',
  subcategoriaLibre: '',
  cuenta: 'Mercado Pago',
  estado_confirmacion: 'confirmado' as 'confirmado' | 'estimado' | 'pendiente',
  afecta_caja: true,
  afecta_resultado: false,
  notas: '',
  vincularCon: '',
};

const ESTADO_LABEL: Record<string, string> = { confirmado: 'Confirmado', estimado: 'Estimado', pendiente: 'Pendiente' };
const ESTADO_COLOR: Record<string, string> = { confirmado: 'bg-primary/10 text-primary', estimado: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', pendiente: 'bg-destructive/10 text-destructive' };

export default function Movimientos() {
  const { user } = useAuth();
  const [mesSel, setMesSel] = useState(() => inicioMes(new Date()));
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [categoriaOtra, setCategoriaOtra] = useState(false);

  useEffect(() => { if (user) load(); }, [user, mesSel]);

  async function load() {
    const { start, end } = rangoMes(mesSel);
    const { data } = await supabase.from('movimientos').select('*')
      .eq('user_id', user!.id)
      .or(`and(fecha.gte.${start},fecha.lte.${end}),and(fecha.is.null,mes_relacionado.gte.${start},mes_relacionado.lte.${end})`)
      .order('fecha', { ascending: false, nullsFirst: false });
    setMovimientos((data as any) ?? []);
  }

  function openNew() {
    setEditId(null);
    setCategoriaOtra(false);
    setForm({ ...emptyForm, fecha: new Date(mesSel.getFullYear(), mesSel.getMonth(), 1).toISOString().split('T')[0] });
    setOpen(true);
  }

  function openEdit(m: Movimiento) {
    setEditId(m.id);
    const opcion = CATEGORIAS_MOVIMIENTO.flatMap(g => g.opciones).find(o => o.value === m.categoria && (o.subcategoria ?? null) === m.subcategoria);
    setCategoriaOtra(!opcion);
    setForm({
      fecha: m.fecha ?? '',
      direccion: m.direccion as 'entrada' | 'salida',
      monto: Number(m.monto),
      contraparte_nombre: m.contraparte_nombre ?? '',
      categoriaKey: opcion ? `${opcion.value}|${opcion.subcategoria ?? ''}` : '',
      categoriaLibre: opcion ? '' : m.categoria,
      subcategoriaLibre: opcion ? '' : (m.subcategoria ?? ''),
      cuenta: m.cuenta ?? 'Mercado Pago',
      estado_confirmacion: m.estado_confirmacion as any,
      afecta_caja: m.afecta_caja,
      afecta_resultado: m.afecta_resultado,
      notas: m.notas ?? '',
      vincularCon: m.linked_transfer_id ?? '',
    });
    setOpen(true);
  }

  function elegirCategoria(key: string) {
    setForm(f => ({ ...f, categoriaKey: key }));
    const [value, sub] = key.split('|');
    const opcion = CATEGORIAS_MOVIMIENTO.flatMap(g => g.opciones).find(o => o.value === value && (o.subcategoria ?? '') === sub);
    if (opcion) setForm(f => ({ ...f, categoriaKey: key, afecta_caja: opcion.afectaCaja, afecta_resultado: opcion.afectaResultado }));
  }

  function sugerirSiEsFacu(nombre: string, fecha: string, direccion: string) {
    if (direccion !== 'salida' || !nombre.toLowerCase().includes('facu')) return;
    const sug = sugerirCategoriaFacu(fecha);
    setCategoriaOtra(false);
    setForm(f => ({ ...f, categoriaKey: `${sug.value}|`, afecta_caja: sug.afectaCaja, afecta_resultado: sug.afectaResultado }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.monto || form.monto <= 0) { toast.error('Ingresá un importe'); return; }
    let categoria = form.categoriaLibre.trim();
    let subcategoria: string | null = form.subcategoriaLibre.trim() || null;
    if (!categoriaOtra && form.categoriaKey) {
      const [value, sub] = form.categoriaKey.split('|');
      categoria = value;
      subcategoria = sub || null;
    }
    if (!categoria) { toast.error('Elegí una categoría'); return; }

    const payload = {
      fecha: form.fecha || null,
      direccion: form.direccion,
      monto: form.monto,
      contraparte_nombre: form.contraparte_nombre.trim() || null,
      categoria,
      subcategoria,
      cuenta: form.cuenta,
      medio_pago: form.cuenta,
      estado_confirmacion: form.estado_confirmacion,
      afecta_caja: form.afecta_caja,
      afecta_resultado: form.afecta_resultado,
      notas: form.notas.trim() || null,
      linked_transfer_id: form.vincularCon || null,
    };

    let idPropio = editId;
    if (editId) {
      const { error } = await supabase.from('movimientos').update(payload).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Movimiento actualizado');
    } else {
      const { data, error } = await supabase.from('movimientos').insert({ user_id: user!.id, ...payload }).select('id').single();
      if (error) { toast.error(error.message); return; }
      idPropio = data.id;
      toast.success('Movimiento registrado');
    }
    // Vincular en ambos sentidos si se eligió "es la misma plata que..."
    if (form.vincularCon && idPropio) {
      await supabase.from('movimientos').update({ linked_transfer_id: idPropio }).eq('id', form.vincularCon);
    }
    setOpen(false);
    load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('movimientos').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Movimiento eliminado');
    setDeleteId(null); load();
  }

  const totalEntradas = movimientos.filter(m => m.direccion === 'entrada' && m.estado_confirmacion === 'confirmado').reduce((s, m) => s + Number(m.monto), 0);
  const totalSalidas = movimientos.filter(m => m.direccion === 'salida' && m.estado_confirmacion === 'confirmado').reduce((s, m) => s + Number(m.monto), 0);
  const candidatosVincular = movimientos.filter(m => m.id !== editId && !m.linked_transfer_id);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimientos</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Acá van los movimientos de plata que <b>no</b> son venta de comida: préstamos, Facundo, Natura, alquiler,
        inversiones, transferencias entre tus cuentas. Las ventas se cargan en Ventas.
      </p>

      <MesSelector mes={mesSel} onChange={setMesSel} />

      <div className="bg-card rounded-lg border p-3 flex gap-4 text-sm">
        <span className="text-muted-foreground">Entradas confirmadas: <span className="font-medium text-foreground">{formatCurrency(totalEntradas)}</span></span>
        <span className="text-muted-foreground">Salidas confirmadas: <span className="font-medium text-foreground">{formatCurrency(totalSalidas)}</span></span>
      </div>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar movimiento' : 'Nuevo movimiento'}</DialogTitle>
            <DialogDescription>Ninguno de estos registros genera una venta ni una factura de Mundo Prana.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><Label>Dirección</Label>
                <Select value={form.direccion} onValueChange={(v: 'entrada' | 'salida') => setForm(f => ({ ...f, direccion: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (recibiste)</SelectItem>
                    <SelectItem value="salida">Salida (enviaste)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div><Label>Importe</Label><Input type="number" step="0.01" value={form.monto || ''} onChange={e => setForm(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))} required /></div>

            <div><Label>Persona, cliente o proveedor (opcional)</Label>
              <Input value={form.contraparte_nombre}
                onChange={e => { setForm(f => ({ ...f, contraparte_nombre: e.target.value })); sugerirSiEsFacu(e.target.value, form.fecha, form.direccion); }}
                placeholder="Ej: Facundo Nahuel Freire" />
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              {!categoriaOtra ? (
                <Select value={form.categoriaKey} onValueChange={elegirCategoria}>
                  <SelectTrigger><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_MOVIMIENTO.map(grupo => (
                      <div key={grupo.grupo}>
                        <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{grupo.grupo}</p>
                        {grupo.opciones.map(o => (
                          <SelectItem key={`${o.value}|${o.subcategoria ?? ''}`} value={`${o.value}|${o.subcategoria ?? ''}`}>{o.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Input placeholder="Nombre de la categoría" value={form.categoriaLibre} onChange={e => setForm(f => ({ ...f, categoriaLibre: e.target.value }))} />
                  <Input placeholder="Subcategoría (opcional)" value={form.subcategoriaLibre} onChange={e => setForm(f => ({ ...f, subcategoriaLibre: e.target.value }))} />
                </div>
              )}
              <button type="button" className="text-xs text-primary" onClick={() => setCategoriaOtra(v => !v)}>
                {categoriaOtra ? '← Elegir de la lista' : '+ Otra categoría (especificar)'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cuenta</Label>
                <Select value={form.cuenta} onValueChange={v => setForm(f => ({ ...f, cuenta: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CUENTAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Estado</Label>
                <Select value={form.estado_confirmacion} onValueChange={(v: any) => setForm(f => ({ ...f, estado_confirmacion: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="estimado">Estimado</SelectItem>
                    <SelectItem value="pendiente">Pendiente de revisar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.afecta_caja} onChange={e => setForm(f => ({ ...f, afecta_caja: e.target.checked }))} /> Afecta caja</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.afecta_resultado} onChange={e => setForm(f => ({ ...f, afecta_resultado: e.target.checked }))} /> Afecta resultado del negocio</label>
            </div>

            {form.direccion && candidatosVincular.length > 0 && (
              <div>
                <Label className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Es la misma plata que... (opcional)</Label>
                <Select value={form.vincularCon || '__ninguno__'} onValueChange={v => setForm(f => ({ ...f, vincularCon: v === '__ninguno__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Vincular con otro movimiento del mes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguno__">Ninguno</SelectItem>
                    {candidatosVincular.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.fecha ? formatDate(m.fecha) : 'sin fecha'} · {m.direccion} · {formatCurrency(Number(m.monto))} {m.contraparte_nombre ? `· ${m.contraparte_nombre}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Usalo cuando esta plata salió de una cuenta tuya y entró en otra: así no se cuenta dos veces.</p>
              </div>
            )}

            <div><Label>Observaciones</Label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} /></div>

            <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Registrar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => exportToCSV(movimientos.map(m => ({
          Fecha: m.fecha ?? '', Direccion: m.direccion, Importe: m.monto, Contraparte: m.contraparte_nombre,
          Categoria: CATEGORIA_MOV_LABEL[m.categoria] ?? m.categoria, Subcategoria: m.subcategoria,
          Cuenta: m.cuenta, Estado: m.estado_confirmacion, AfectaCaja: m.afecta_caja, AfectaResultado: m.afecta_resultado, Notas: m.notas,
        })), 'movimientos')}><Download className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-2">
        {movimientos.map(m => (
          <div key={m.id} className="bg-card rounded-lg border p-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{CATEGORIA_MOV_LABEL[m.categoria] ?? m.categoria}</span>
                {m.subcategoria && <span className="text-xs text-muted-foreground">· {m.subcategoria}</span>}
                <Badge className={`text-xs ${ESTADO_COLOR[m.estado_confirmacion]}`}>{ESTADO_LABEL[m.estado_confirmacion]}</Badge>
                {m.linked_transfer_id && <Badge variant="outline" className="text-xs"><Link2 className="w-3 h-3 mr-1" />vinculado</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.fecha ? formatDate(m.fecha) : 'sin fecha'} · {m.direccion === 'entrada' ? 'entrada' : 'salida'} · {m.cuenta ?? 'sin cuenta'}
                {m.contraparte_nombre ? ` · ${m.contraparte_nombre}` : ''}
              </p>
              {m.notas && <p className="text-xs text-muted-foreground mt-0.5">{m.notas}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <p className={`font-semibold text-sm ${m.direccion === 'entrada' ? 'text-primary' : ''}`}>{m.direccion === 'salida' ? '-' : ''}{formatCurrency(Number(m.monto))}</p>
              <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(m.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
        {movimientos.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Sin movimientos este mes</p>}
      </div>
    </div>
  );
}
