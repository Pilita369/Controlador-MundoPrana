import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Copy, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import ImportarIA from '@/components/ImportarIA';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Menu {
  id: string; nombre: string; tipo: string; mes: string | null; notas: string | null;
}
interface MenuItem {
  id: string; menu_id: string; fecha: string | null; dia_semana: number | null;
  producto_id: string | null; nombre_plato: string; categoria: string | null;
  precio: number | null; orden: number;
}
interface ProductoLite { id: string; nombre: string; precio_venta: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function mesInputValue(mes: string | null): string {
  return mes ? mes.slice(0, 7) : '';
}
function mesToDate(v: string): string | null {
  return v ? `${v}-01` : null;
}
function mesLabel(mes: string | null): string {
  if (!mes) return 'Sin mes';
  const d = new Date(mes + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
function fechaLabel(f: string): string {
  const d = new Date(f + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()}`;
}
// diferencia en meses entre dos 'YYYY-MM-01'
function diffMeses(desde: string, hasta: string): number {
  const a = new Date(desde + 'T12:00:00'), b = new Date(hasta + 'T12:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
function sumarMeses(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Componente ───────────────────────────────────────────────────────────────

const emptyMenuForm = { nombre: '', tipo: 'mediodia', mes: '', notas: '' };

export default function Menus() {
  const { user } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [itemsPorMenu, setItemsPorMenu] = useState<Record<string, MenuItem[]>>({});
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [tab, setTab] = useState<'mediodia' | 'congelados'>('mediodia');
  const [expandido, setExpandido] = useState<string | null>(null);

  const [menuDialog, setMenuDialog] = useState(false);
  const [editMenuId, setEditMenuId] = useState<string | null>(null);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [deleteMenuId, setDeleteMenuId] = useState<string | null>(null);

  // form de item nuevo (por menú expandido)
  const [itemForm, setItemForm] = useState({ nombre_plato: '', fecha: '', categoria: '', precio: '', producto_id: '' as string, buscar: '' });

  useEffect(() => { if (user) { loadMenus(); loadProductos(); } }, [user]);

  async function loadMenus() {
    const { data } = await supabase.from('menus').select('*').eq('user_id', user!.id).order('mes', { ascending: false, nullsFirst: false }).order('nombre');
    setMenus((data as any) ?? []);
  }
  async function loadProductos() {
    const { data } = await supabase.from('productos').select('id, nombre, precio_venta').match({ user_id: user!.id, activo: true, clase: 'elaborado' }).order('nombre');
    setProductos((data as any) ?? []);
  }
  async function loadItems(menuId: string) {
    const { data } = await supabase.from('menu_items').select('*').eq('menu_id', menuId).order('fecha', { ascending: true, nullsFirst: true }).order('orden');
    setItemsPorMenu(prev => ({ ...prev, [menuId]: (data as any) ?? [] }));
  }

  function toggleExpand(menuId: string) {
    if (expandido === menuId) { setExpandido(null); return; }
    setExpandido(menuId);
    resetItemForm();
    if (!itemsPorMenu[menuId]) loadItems(menuId);
  }
  function resetItemForm() {
    setItemForm({ nombre_plato: '', fecha: '', categoria: '', precio: '', producto_id: '', buscar: '' });
  }

  // ── Menú: crear / editar ────────────────────────────────────────────────────

  function openNewMenu() {
    setEditMenuId(null);
    setMenuForm({ ...emptyMenuForm, tipo: tab });
    setMenuDialog(true);
  }
  function openEditMenu(m: Menu) {
    setEditMenuId(m.id);
    setMenuForm({ nombre: m.nombre, tipo: m.tipo, mes: mesInputValue(m.mes), notas: m.notas ?? '' });
    setMenuDialog(true);
  }
  async function submitMenu(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      nombre: menuForm.nombre.trim(),
      tipo: menuForm.tipo,
      mes: mesToDate(menuForm.mes),
      notas: menuForm.notas || null,
    };
    if (editMenuId) {
      const { error } = await supabase.from('menus').update(payload).eq('id', editMenuId);
      if (error) { toast.error(error.message); return; }
      toast.success('Menú actualizado');
    } else {
      const { error } = await supabase.from('menus').insert({ ...payload, user_id: user!.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Menú creado');
    }
    setMenuDialog(false); loadMenus();
  }
  async function confirmDeleteMenu() {
    if (!deleteMenuId) return;
    const { error } = await supabase.from('menus').delete().eq('id', deleteMenuId);
    if (error) { toast.error(error.message); return; }
    toast.success('Menú eliminado');
    setDeleteMenuId(null); setExpandido(null); loadMenus();
  }

  // ── Duplicar menú ──────────────────────────────────────────────────────────

  async function duplicarMenu(m: Menu) {
    const items = itemsPorMenu[m.id] ?? (await supabase.from('menu_items').select('*').eq('menu_id', m.id)).data as MenuItem[] ?? [];
    // mes nuevo = mes + 1 (si tiene mes)
    const nuevoMes = m.mes ? sumarMeses(m.mes, 1) : null;
    const { data: nuevo, error } = await supabase.from('menus').insert({
      user_id: user!.id,
      nombre: `${m.nombre} (copia)`,
      tipo: m.tipo,
      mes: nuevoMes,
      notas: m.notas,
    }).select('id').single();
    if (error || !nuevo) { toast.error(error?.message ?? 'No se pudo duplicar'); return; }

    const shift = (m.mes && nuevoMes) ? diffMeses(m.mes, nuevoMes) : 0;
    if (items.length > 0) {
      const nuevosItems = items.map(it => ({
        user_id: user!.id,
        menu_id: nuevo.id,
        fecha: it.fecha && shift ? sumarMeses(it.fecha, shift) : it.fecha,
        dia_semana: it.dia_semana,
        producto_id: it.producto_id,
        nombre_plato: it.nombre_plato,
        categoria: it.categoria,
        precio: it.precio,
        orden: it.orden,
      }));
      const { error: e2 } = await supabase.from('menu_items').insert(nuevosItems);
      if (e2) { toast.error(e2.message); return; }
    }
    toast.success('Menú duplicado');
    loadMenus();
    setExpandido(nuevo.id);
    loadItems(nuevo.id);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  async function agregarItem(menuId: string, esMediodia: boolean) {
    const nombre = itemForm.nombre_plato.trim();
    if (!nombre) { toast.error('Escribí el nombre del plato'); return; }
    const orden = (itemsPorMenu[menuId]?.length ?? 0);
    const { error } = await supabase.from('menu_items').insert({
      user_id: user!.id,
      menu_id: menuId,
      nombre_plato: nombre,
      fecha: esMediodia && itemForm.fecha ? itemForm.fecha : null,
      producto_id: itemForm.producto_id || null,
      categoria: itemForm.categoria || null,
      precio: itemForm.precio ? parseFloat(itemForm.precio) : null,
      orden,
    });
    if (error) { toast.error(error.message); return; }
    resetItemForm();
    loadItems(menuId);
  }

  async function borrarItem(item: MenuItem) {
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
    if (error) { toast.error(error.message); return; }
    loadItems(item.menu_id);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const menusFiltrados = menus.filter(m => m.tipo === tab);
  const prodBusqueda = productos.filter(p => p.nombre.toLowerCase().includes(itemForm.buscar.toLowerCase()));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Menús</h1>
        <div className="flex gap-2 flex-wrap">
          <ImportarIA target="menu" onDone={() => { loadMenus(); if (expandido) loadItems(expandido); }} />
          <Button size="sm" onClick={openNewMenu}><Plus className="w-4 h-4 mr-1" /> Nuevo menú</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => { setTab(v as any); setExpandido(null); }}>
        <TabsList className="w-full">
          <TabsTrigger value="mediodia" className="flex-1">Mediodía</TabsTrigger>
          <TabsTrigger value="congelados" className="flex-1">Congelados</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Dialog crear/editar menú */}
      <Dialog open={menuDialog} onOpenChange={setMenuDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editMenuId ? 'Editar menú' : 'Nuevo menú'}</DialogTitle></DialogHeader>
          <form onSubmit={submitMenu} className="space-y-3">
            <div><Label>Nombre</Label><Input value={menuForm.nombre} onChange={e => setMenuForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Menú Mediodía Septiembre" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <Select value={menuForm.tipo} onValueChange={v => setMenuForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mediodia">Mediodía</SelectItem>
                    <SelectItem value="congelados">Congelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Mes</Label><Input type="month" value={menuForm.mes} onChange={e => setMenuForm(f => ({ ...f, mes: e.target.value }))} /></div>
            </div>
            <div><Label>Notas</Label><Input value={menuForm.notas} onChange={e => setMenuForm(f => ({ ...f, notas: e.target.value }))} /></div>
            <Button type="submit" className="w-full">{editMenuId ? 'Guardar' : 'Crear'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrar menú */}
      <AlertDialog open={!!deleteMenuId} onOpenChange={o => !o && setDeleteMenuId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este menú?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminan también todos sus platos. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMenu} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lista de menús */}
      <div className="space-y-2">
        {menusFiltrados.map(m => {
          const abierto = expandido === m.id;
          const items = itemsPorMenu[m.id] ?? [];
          const esMediodia = m.tipo === 'mediodia';
          return (
            <div key={m.id} className="bg-card rounded-lg border">
              <div className="p-3 flex items-center gap-2">
                <button onClick={() => toggleExpand(m.id)} className="flex-1 flex items-center gap-2 min-w-0 text-left">
                  {abierto ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.nombre}</p>
                    <p className="text-xs text-muted-foreground capitalize">{mesLabel(m.mes)}{itemsPorMenu[m.id] ? ` · ${items.length} platos` : ''}</p>
                  </div>
                </button>
                <Button variant="ghost" size="sm" title="Duplicar" onClick={() => duplicarMenu(m)}><Copy className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => openEditMenu(m)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteMenuId(m.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>

              {abierto && (
                <div className="border-t p-3 space-y-3">
                  {/* Items existentes */}
                  <div className="space-y-1">
                    {items.map(it => (
                      <div key={it.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {esMediodia && it.fecha && <span className="text-xs text-muted-foreground w-24 shrink-0">{fechaLabel(it.fecha)}</span>}
                            <span className="truncate">{it.nombre_plato}</span>
                            {it.categoria && <Badge variant="outline" className="text-xs">{it.categoria === 'carne' ? 'Carne' : it.categoria === 'vegano' ? 'Vegano' : 'Veggie'}</Badge>}
                            {it.precio != null && <span className="text-xs text-muted-foreground">{formatCurrency(it.precio)}</span>}
                          </div>
                        </div>
                        <button onClick={() => borrarItem(it)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay platos.</p>}
                  </div>

                  {/* Agregar item */}
                  <div className="space-y-2 border-t pt-3">
                    {esMediodia && (
                      <Input type="date" value={itemForm.fecha} onChange={e => setItemForm(f => ({ ...f, fecha: e.target.value }))} className="h-9" />
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Nombre del plato (o buscá un producto)"
                        value={itemForm.buscar || itemForm.nombre_plato}
                        onChange={e => setItemForm(f => ({ ...f, buscar: e.target.value, nombre_plato: e.target.value, producto_id: '' }))}
                        className="pl-9 h-9"
                      />
                      {itemForm.buscar && !itemForm.producto_id && prodBusqueda.length > 0 && (
                        <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto mt-1">
                          {prodBusqueda.slice(0, 6).map(p => (
                            <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                              onClick={() => setItemForm(f => ({ ...f, producto_id: p.id, nombre_plato: p.nombre, buscar: '', precio: p.precio_venta ? String(p.precio_venta) : f.precio }))}>
                              <span>{p.nombre}</span>
                              <span className="text-xs text-muted-foreground">{formatCurrency(p.precio_venta)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {itemForm.producto_id && <p className="text-xs text-primary px-1 mt-1">✓ vinculado a producto</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={itemForm.categoria || 'ninguna'} onValueChange={v => setItemForm(f => ({ ...f, categoria: v === 'ninguna' ? '' : v }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguna">Sin categoría</SelectItem>
                          <SelectItem value="vegano">Vegano</SelectItem>
                          <SelectItem value="vegetariano">Vegetariano</SelectItem>
                          <SelectItem value="carne">Carne</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" step="0.01" placeholder="Precio (opcional)" value={itemForm.precio} onChange={e => setItemForm(f => ({ ...f, precio: e.target.value }))} className="h-9" />
                    </div>
                    <Button type="button" size="sm" className="w-full" onClick={() => agregarItem(m.id, esMediodia)}>
                      <Plus className="w-4 h-4 mr-1" /> Agregar plato
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {menusFiltrados.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">No hay menús de {tab === 'mediodia' ? 'mediodía' : 'congelados'}. Creá uno o duplicá el del mes anterior.</p>
        )}
      </div>
    </div>
  );
}
