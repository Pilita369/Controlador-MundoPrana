import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Categoria { id: string; nombre: string; tipo: string; }
interface Gasto { id: string; fecha: string; descripcion: string; monto: number; tipo: string; medio_pago: string; notas: string | null; categorias_gasto: { nombre: string } | null; }

export default function Gastos() {
  const { user } = useAuth();
  const [tab, setTab] = useState('negocio');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [open, setOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [form, setForm] = useState({ fecha: new Date().toISOString().split('T')[0], descripcion: '', monto: 0, categoria_id: '', medio_pago: 'efectivo', notas: '' });

  useEffect(() => { if (user) { load(); loadCats(); } }, [user, tab]);

  async function load() {
    const { data } = await supabase.from('gastos').select('*, categorias_gasto(nombre)').eq('user_id', user!.id).eq('tipo', tab).order('fecha', { ascending: false });
    setGastos((data as any) ?? []);
  }

  async function loadCats() {
    const { data } = await supabase.from('categorias_gasto').select('*').eq('user_id', user!.id).eq('tipo', tab);
    setCategorias(data ?? []);
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    await supabase.from('categorias_gasto').insert({ user_id: user!.id, nombre: newCat.trim(), tipo: tab });
    setNewCat('');
    loadCats();
    toast.success('Categoría creada');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('gastos').insert({
      user_id: user!.id, tipo: tab, fecha: form.fecha, descripcion: form.descripcion,
      monto: form.monto, categoria_id: form.categoria_id || null, medio_pago: form.medio_pago, notas: form.notas || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Gasto registrado');
    setOpen(false);
    setForm({ fecha: new Date().toISOString().split('T')[0], descripcion: '', monto: 0, categoria_id: '', medio_pago: 'efectivo', notas: '' });
    load();
  }

  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);
  const byCategoria: Record<string, number> = {};
  gastos.forEach(g => { const n = g.categorias_gasto?.nombre ?? 'Sin categoría'; byCategoria[n] = (byCategoria[n] ?? 0) + Number(g.monto); });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gastos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nuevo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar gasto ({tab})</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><Label>Descripción</Label><Input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} required /></div>
              <div><Label>Monto</Label><Input type="number" step="0.01" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))} required /></div>
              <div><Label>Categoría</Label>
                <Select value={form.categoria_id} onValueChange={v => setForm(f => ({ ...f, categoria_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex gap-2 mt-1">
                  <Input placeholder="Nueva categoría" value={newCat} onChange={e => setNewCat(e.target.value)} className="text-xs" />
                  <Button type="button" variant="outline" size="sm" onClick={addCategory}>+</Button>
                </div>
              </div>
              <div><Label>Medio de pago</Label>
                <Select value={form.medio_pago} onValueChange={v => setForm(f => ({ ...f, medio_pago: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
              <Button type="submit" className="w-full">Registrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full"><TabsTrigger value="negocio" className="flex-1">Negocio</TabsTrigger><TabsTrigger value="personal" className="flex-1">Personal</TabsTrigger></TabsList>
      </Tabs>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Total: {formatCurrency(total)}</span>
        <Button variant="outline" size="sm" onClick={() => exportToCSV(gastos.map(g => ({ Fecha: g.fecha, Descripción: g.descripcion, Monto: g.monto, Categoría: g.categorias_gasto?.nombre, Medio: g.medio_pago, Notas: g.notas })), `gastos_${tab}`)}><Download className="w-4 h-4" /></Button>
      </div>

      {Object.entries(byCategoria).length > 0 && (
        <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-3 text-xs">
          {Object.entries(byCategoria).map(([k, v]) => <span key={k} className="text-muted-foreground">{k}: {formatCurrency(v)}</span>)}
        </div>
      )}

      <div className="space-y-2">
        {gastos.map(g => (
          <div key={g.id} className="bg-card rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{g.descripcion}</p>
              <p className="text-xs text-muted-foreground">{formatDate(g.fecha)} · {g.categorias_gasto?.nombre} · {g.medio_pago}</p>
            </div>
            <p className="font-semibold text-sm">{formatCurrency(Number(g.monto))}</p>
          </div>
        ))}
        {gastos.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No hay gastos registrados</p>}
      </div>
    </div>
  );
}
