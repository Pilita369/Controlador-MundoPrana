import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Search, User } from 'lucide-react';
import { toast } from 'sonner';

interface Cliente {
  id: string; nombre: string; es_mensual: boolean; monto_mensual: number | null;
  notas: string | null; activo: boolean;
}

const emptyForm = { nombre: '', es_mensual: false, monto_mensual: '', notas: '', activo: true };

export default function Clientes() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data } = await supabase.from('clientes').select('*').eq('user_id', user!.id).order('activo', { ascending: false }).order('nombre');
    setClientes((data as any) ?? []);
  }

  function openNew() { setEditId(null); setForm(emptyForm); setOpen(true); }
  function openEdit(c: Cliente) {
    setEditId(c.id);
    setForm({
      nombre: c.nombre, es_mensual: c.es_mensual,
      monto_mensual: c.monto_mensual != null ? String(c.monto_mensual) : '',
      notas: c.notas ?? '', activo: c.activo,
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      user_id: user!.id,
      nombre: form.nombre.trim(),
      es_mensual: form.es_mensual,
      monto_mensual: form.es_mensual && form.monto_mensual ? parseFloat(form.monto_mensual) : null,
      notas: form.notas.trim() || null,
      activo: form.activo,
    };
    const { error } = editId
      ? await supabase.from('clientes').update(payload).eq('id', editId)
      : await supabase.from('clientes').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? 'Cliente actualizado' : 'Cliente agregado');
    setOpen(false); load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('clientes').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Cliente eliminado');
    setDeleteId(null); load();
  }

  const lista = clientes.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const mensuales = lista.filter(c => c.es_mensual && c.activo).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nuevo cliente</Button>
      </div>

      <div className="bg-card rounded-lg border p-3 text-sm flex flex-wrap gap-4">
        <span className="font-medium">{clientes.filter(c => c.activo).length} activos</span>
        <span className="text-muted-foreground">{mensuales} mensualizados</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
            <DialogDescription>En "Notas" podés aclarar lo que necesites (ej: hace ensaladas especiales, pide congelados los viernes, sin cebolla...).</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Crysti" required /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.es_mensual} onCheckedChange={v => setForm(f => ({ ...f, es_mensual: v }))} />
              <Label>Cliente mensualizado (paga un abono fijo por mes)</Label>
            </div>
            {form.es_mensual && (
              <div><Label>Monto mensual</Label><Input type="number" step="1000" value={form.monto_mensual} onChange={e => setForm(f => ({ ...f, monto_mensual: e.target.value }))} placeholder="opcional" /></div>
            )}
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Preferencias, pedidos habituales, aclaraciones..." /></div>
            <div className="flex items-center gap-2"><Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} /><Label>Activo</Label></div>
            <Button type="submit" className="w-full">{editId ? 'Guardar' : 'Agregar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
            <AlertDialogDescription>Las ventas ya registradas a su nombre no se borran.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-2">
        {lista.map(c => (
          <div key={c.id} className={`bg-card rounded-lg border p-3 flex items-start gap-3 ${!c.activo ? 'opacity-60' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{c.nombre}</span>
                <Badge variant={c.es_mensual ? 'secondary' : 'outline'} className="text-xs">{c.es_mensual ? 'Mensualizado' : 'Esporádico'}</Badge>
                {c.es_mensual && c.monto_mensual != null && <span className="text-xs text-muted-foreground">{formatCurrency(c.monto_mensual)}/mes</span>}
              </div>
              {c.notas && <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">{c.notas}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay clientes cargados</p>}
      </div>
    </div>
  );
}
