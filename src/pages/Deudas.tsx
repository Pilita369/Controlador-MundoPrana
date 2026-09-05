import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit2, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface Deuda {
  id: string; nombre: string; tipo: string; ambito: string | null;
  monto_total: number | null; cuota_estimada: number | null;
  cuotas_totales: number | null; cuotas_pagadas: number;
  fecha_inicio: string | null; estado: string; notas: string | null; activo: boolean;
}

const TIPO_LABEL: Record<string, string> = { credito: 'Crédito', impuesto: 'Impuesto', servicio: 'Servicio', otro: 'Otro' };
const ESTADO_LABEL: Record<string, string> = { al_dia: 'Al día', atrasada: 'Atrasada', cancelada: 'Cancelada' };
const estadoVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = { al_dia: 'secondary', atrasada: 'destructive', cancelada: 'outline' };

const emptyForm = {
  nombre: '', tipo: 'credito', ambito: 'negocio',
  monto_total: '', cuota_estimada: '', cuotas_totales: '', cuotas_pagadas: '0',
  fecha_inicio: '', estado: 'al_dia', notas: '',
};

export default function Deudas() {
  const { user } = useAuth();
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pagoDeuda, setPagoDeuda] = useState<Deuda | null>(null);
  const [pago, setPago] = useState({ monto: '', fecha: new Date().toISOString().split('T')[0], medio_pago: 'transferencia', comoGasto: true });

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data } = await supabase.from('deudas').select('*').eq('user_id', user!.id).order('activo', { ascending: false }).order('tipo').order('nombre');
    setDeudas((data as any) ?? []);
  }

  function openNew() { setEditId(null); setForm(emptyForm); setOpen(true); }
  function openEdit(d: Deuda) {
    setEditId(d.id);
    setForm({
      nombre: d.nombre, tipo: d.tipo, ambito: d.ambito ?? 'negocio',
      monto_total: d.monto_total != null ? String(d.monto_total) : '',
      cuota_estimada: d.cuota_estimada != null ? String(d.cuota_estimada) : '',
      cuotas_totales: d.cuotas_totales != null ? String(d.cuotas_totales) : '',
      cuotas_pagadas: String(d.cuotas_pagadas),
      fecha_inicio: d.fecha_inicio ?? '', estado: d.estado, notas: d.notas ?? '',
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      user_id: user!.id,
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      ambito: form.ambito || null,
      monto_total: form.monto_total ? parseFloat(form.monto_total) : null,
      cuota_estimada: form.cuota_estimada ? parseFloat(form.cuota_estimada) : null,
      cuotas_totales: form.cuotas_totales ? parseInt(form.cuotas_totales) : null,
      cuotas_pagadas: parseInt(form.cuotas_pagadas) || 0,
      fecha_inicio: form.fecha_inicio || null,
      estado: form.estado,
      notas: form.notas || null,
      activo: form.estado !== 'cancelada',
    };
    const { error } = editId
      ? await supabase.from('deudas').update(payload).eq('id', editId)
      : await supabase.from('deudas').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? 'Deuda actualizada' : 'Deuda agregada');
    setOpen(false); load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('deudas').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Deuda eliminada');
    setDeleteId(null); load();
  }

  function abrirPago(d: Deuda) {
    setPagoDeuda(d);
    setPago({ monto: d.cuota_estimada != null ? String(d.cuota_estimada) : '', fecha: new Date().toISOString().split('T')[0], medio_pago: 'transferencia', comoGasto: true });
  }

  async function registrarPago() {
    if (!pagoDeuda || !user) return;
    const monto = parseFloat(pago.monto) || 0;
    if (monto <= 0) { toast.error('Ingresá el monto pagado'); return; }
    const tipoGasto = pagoDeuda.ambito === 'personal' ? 'personal' : 'negocio';

    if (pago.comoGasto) {
      // buscar o crear categoria "Créditos y deudas"
      let categoriaId: string | null = null;
      const { data: cat } = await supabase.from('categorias_gasto').select('id').match({ user_id: user.id, tipo: tipoGasto, nombre: 'Créditos y deudas' }).maybeSingle();
      if (cat) categoriaId = cat.id;
      else {
        const { data: nueva } = await supabase.from('categorias_gasto').insert({ user_id: user.id, tipo: tipoGasto, nombre: 'Créditos y deudas' }).select('id').single();
        categoriaId = nueva?.id ?? null;
      }
      await supabase.from('gastos').insert({
        user_id: user.id, fecha: pago.fecha, descripcion: `Cuota ${pagoDeuda.nombre}`,
        monto, tipo: tipoGasto, medio_pago: pago.medio_pago, categoria_id: categoriaId, deuda_id: pagoDeuda.id,
      });
    }

    const nuevasPagadas = pagoDeuda.cuotas_pagadas + 1;
    const cancelada = pagoDeuda.cuotas_totales != null && nuevasPagadas >= pagoDeuda.cuotas_totales;
    await supabase.from('deudas').update({
      cuotas_pagadas: nuevasPagadas,
      estado: cancelada ? 'cancelada' : (pagoDeuda.estado === 'atrasada' ? 'atrasada' : 'al_dia'),
      activo: !cancelada,
    }).eq('id', pagoDeuda.id);

    toast.success(cancelada ? `${pagoDeuda.nombre}: última cuota, deuda cancelada` : 'Pago registrado');
    setPagoDeuda(null); load();
  }

  const activas = deudas.filter(d => d.activo);
  const compromisoMensual = useMemo(() => activas.reduce((s, d) => s + (Number(d.cuota_estimada) || 0), 0), [activas]);
  const totalConocido = useMemo(() => activas.reduce((s, d) => s + (Number(d.monto_total) || 0), 0), [activas]);
  const atrasadas = activas.filter(d => d.estado === 'atrasada').length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deudas</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nueva deuda</Button>
      </div>

      <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-4 text-sm">
        <span className="font-medium">Compromiso mensual: {formatCurrency(compromisoMensual)}</span>
        {totalConocido > 0 && <span className="text-muted-foreground">Total conocido a cancelar: {formatCurrency(totalConocido)}</span>}
        {atrasadas > 0 && <span className="text-destructive">{atrasadas} atrasada(s)</span>}
      </div>

      {/* Alta / edición */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar deuda' : 'Nueva deuda'}</DialogTitle>
            <DialogDescription>Cargá lo que sepas. Podés dejar campos en blanco y completarlos después.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Banco Nación" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Ámbito</Label>
                <Select value={form.ambito} onValueChange={v => setForm(f => ({ ...f, ambito: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="negocio">Negocio</SelectItem><SelectItem value="personal">Personal</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cuota mensual (aprox)</Label><Input type="number" step="100" value={form.cuota_estimada} onChange={e => setForm(f => ({ ...f, cuota_estimada: e.target.value }))} placeholder="opcional" /></div>
              <div><Label>Total a cancelar</Label><Input type="number" step="1000" value={form.monto_total} onChange={e => setForm(f => ({ ...f, monto_total: e.target.value }))} placeholder="opcional" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Cuotas totales</Label><Input type="number" value={form.cuotas_totales} onChange={e => setForm(f => ({ ...f, cuotas_totales: e.target.value }))} placeholder="?" /></div>
              <div><Label>Cuotas pagadas</Label><Input type="number" value={form.cuotas_pagadas} onChange={e => setForm(f => ({ ...f, cuotas_pagadas: e.target.value }))} /></div>
              <div><Label>Inicio</Label><Input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
            </div>
            <div><Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => setForm(f => ({ ...f, estado: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} /></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar' : 'Agregar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={!!pagoDeuda} onOpenChange={o => !o && setPagoDeuda(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pago de cuota — {pagoDeuda?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Monto</Label><Input type="number" step="100" value={pago.monto} onChange={e => setPago(p => ({ ...p, monto: e.target.value }))} /></div>
              <div><Label>Fecha</Label><Input type="date" value={pago.fecha} onChange={e => setPago(p => ({ ...p, fecha: e.target.value }))} /></div>
            </div>
            <div><Label>Medio de pago</Label>
              <Select value={pago.medio_pago} onValueChange={v => setPago(p => ({ ...p, medio_pago: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={pago.comoGasto} onCheckedChange={v => setPago(p => ({ ...p, comoGasto: !!v }))} />
              <Label className="text-sm font-normal">Registrarlo también como gasto {pagoDeuda?.ambito === 'personal' ? 'personal' : 'del negocio'}</Label>
            </div>
            <Button className="w-full" onClick={registrarPago}>Registrar pago</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta deuda?</AlertDialogTitle>
            <AlertDialogDescription>Los pagos ya registrados como gastos no se borran.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-2">
        {deudas.map(d => {
          const progreso = d.cuotas_totales != null
            ? `${d.cuotas_pagadas}/${d.cuotas_totales} cuotas`
            : d.cuotas_pagadas > 0 ? `${d.cuotas_pagadas} cuota(s) pagada(s)` : null;
          return (
            <div key={d.id} className={`bg-card rounded-lg border p-3 ${!d.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{d.nombre}</span>
                    <Badge variant="outline" className="text-xs">{TIPO_LABEL[d.tipo]}</Badge>
                    <Badge variant={estadoVariant[d.estado]} className="text-xs">{ESTADO_LABEL[d.estado]}</Badge>
                    {d.ambito === 'personal' && <Badge variant="outline" className="text-xs">Personal</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.cuota_estimada != null && `Cuota ~${formatCurrency(d.cuota_estimada)}`}
                    {d.cuota_estimada != null && progreso && ' · '}
                    {progreso}
                    {d.monto_total != null && ` · Total ${formatCurrency(d.monto_total)}`}
                    {d.fecha_inicio && ` · desde ${formatDate(d.fecha_inicio)}`}
                  </p>
                  {d.notas && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{d.notas}</p>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(d.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              {d.activo && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => abrirPago(d)}>
                  <Wallet className="w-4 h-4 mr-1" /> Registrar pago de cuota
                </Button>
              )}
            </div>
          );
        })}
        {deudas.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay deudas cargadas</p>}
      </div>
    </div>
  );
}
