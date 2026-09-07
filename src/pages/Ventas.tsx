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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Download, Search, Trash2, Edit2, X, User, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { normalizarNombre } from '@/lib/importParser';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoIngreso = 'esporadico' | 'mensualidad';

interface Producto { id: string; nombre: string; precio_venta: number; stock_actual: number; }
interface Cliente { id: string; nombre: string; es_mensual: boolean; monto_mensual: number | null; notas: string | null; }

interface ItemLinea {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

interface VentaItem {
  id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  productos: { nombre: string } | null;
}

interface Pedido {
  id: string;
  fecha: string;
  cliente: string | null;
  cliente_id: string | null;
  tipo_ingreso: string;
  mes_mensualidad: string | null;
  notas: string | null;
  medio_cobro: string;
  subtotal: number;
  descuento_monto: number;
  descuento_porcentaje: number;
  total: number;
  items: VentaItem[];
}

interface VentaLegacy {
  id: string;
  fecha: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  medio_cobro: string;
  producto_id: string;
  productos: { nombre: string } | null;
}

// Entrada unificada para la lista
type EntradaLista =
  | { tipo: 'pedido'; data: Pedido }
  | { tipo: 'legacy'; data: VentaLegacy };

// ─── Form ─────────────────────────────────────────────────────────────────────

const mesActual = () => new Date().toISOString().slice(0, 7);

const emptyForm = {
  tipo_ingreso: 'esporadico' as TipoIngreso,
  fecha: new Date().toISOString().split('T')[0],
  cliente: '',
  cliente_id: '',
  mes_mensualidad: mesActual(),
  monto_mensualidad: 0,
  medio_cobro: 'efectivo',
  descuento_tipo: 'porcentaje' as 'porcentaje' | 'monto',
  descuento_valor: 0,
  notas: '',
  items: [] as ItemLinea[],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotales(items: ItemLinea[], desc_tipo: 'porcentaje' | 'monto', desc_valor: number) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
  const descuento_monto = desc_tipo === 'porcentaje'
    ? subtotal * (desc_valor / 100)
    : Math.min(desc_valor, subtotal);
  const descuento_porcentaje = desc_tipo === 'porcentaje'
    ? desc_valor
    : subtotal > 0 ? (desc_valor / subtotal) * 100 : 0;
  const total = subtotal - descuento_monto;
  return { subtotal, descuento_monto, descuento_porcentaje, total };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Ventas() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [legacyVentas, setLegacyVentas] = useState<VentaLegacy[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscarCliente, setBuscarCliente] = useState('');
  const [open, setOpen] = useState(false);
  const [editPedidoId, setEditPedidoId] = useState<string | null>(null);
  const [editLegacyId, setEditLegacyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buscarProducto, setBuscarProducto] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ tipo: 'pedido' | 'legacy'; id: string } | null>(null);

  // Form de legacy (venta individual vieja)
  const [legacyForm, setLegacyForm] = useState({
    producto_id: '', cantidad: 1, precio_unitario: 0, medio_cobro: 'efectivo',
    fecha: new Date().toISOString().split('T')[0],
  });
  const [buscarLegacy, setBuscarLegacy] = useState('');

  useEffect(() => { if (user) { load(); loadProductos(); loadClientes(); } }, [user]);

  async function load() {
    const [pedidosRes, ventasConPedidoRes, legacyRes] = await Promise.all([
      supabase.from('pedidos')
        .select('*')
        .eq('user_id', user!.id)
        .order('fecha', { ascending: false }),
      supabase.from('ventas')
        .select('id, pedido_id, producto_id, cantidad, precio_unitario, total, productos(nombre)')
        .eq('user_id', user!.id)
        .not('pedido_id', 'is', null),
      supabase.from('ventas')
        .select('*, productos(nombre)')
        .eq('user_id', user!.id)
        .is('pedido_id', null)
        .order('fecha', { ascending: false }),
    ]);

    if (pedidosRes.error) console.error('Error pedidos:', pedidosRes.error);
    if (ventasConPedidoRes.error) console.error('Error ventas con pedido:', ventasConPedidoRes.error);
    if (legacyRes.error) console.error('Error legacy ventas:', legacyRes.error);

    if (pedidosRes.data) {
      const itemsPorPedido: Record<string, VentaItem[]> = {};
      (ventasConPedidoRes.data ?? []).forEach((v: any) => {
        if (!itemsPorPedido[v.pedido_id]) itemsPorPedido[v.pedido_id] = [];
        itemsPorPedido[v.pedido_id].push(v);
      });
      setPedidos(pedidosRes.data.map((p: any) => ({ ...p, items: itemsPorPedido[p.id] ?? [] })));
    }
    if (legacyRes.data) {
      setLegacyVentas((legacyRes.data as unknown as VentaLegacy[]) ?? []);
    }
  }

  async function loadProductos() {
    const { data } = await supabase.from('productos')
      .select('id, nombre, precio_venta, stock_actual')
      .match({ user_id: user!.id, activo: true, clase: 'elaborado' });
    if (data) setProductos((data as unknown as Producto[]) ?? []);
  }

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('id, nombre, es_mensual, monto_mensual, notas').eq('user_id', user!.id).eq('activo', true).order('nombre');
    setClientes((data as Cliente[]) ?? []);
  }

  async function crearYSeleccionarCliente(esMensual: boolean) {
    const nombre = buscarCliente.trim();
    if (!nombre) return;
    const { data, error } = await supabase.from('clientes').insert({
      user_id: user!.id, nombre, es_mensual: esMensual,
      monto_mensual: esMensual && form.monto_mensualidad ? form.monto_mensualidad : null,
    }).select('id, nombre, es_mensual, monto_mensual, notas').single();
    if (error) { toast.error(error.message); return; }
    setClientes(cs => [...cs, data as Cliente]);
    seleccionarCliente(data as Cliente);
  }

  function seleccionarCliente(c: Cliente) {
    setForm(f => ({ ...f, cliente_id: c.id, cliente: c.nombre, monto_mensualidad: c.monto_mensual ?? f.monto_mensualidad }));
    setBuscarCliente('');
  }

  // ── Agregar item al formulario ───────────────────────────────────────────────

  function agregarItem(prod: Producto) {
    setForm(f => {
      const existente = f.items.findIndex(i => i.producto_id === prod.id);
      if (existente >= 0) {
        const items = [...f.items];
        items[existente] = { ...items[existente], cantidad: items[existente].cantidad + 1 };
        return { ...f, items };
      }
      return {
        ...f,
        items: [...f.items, { producto_id: prod.id, nombre: prod.nombre, cantidad: 1, precio_unitario: prod.precio_venta }],
      };
    });
    setBuscarProducto('');
  }

  function quitarItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function actualizarItem(idx: number, campo: 'cantidad' | 'precio_unitario', valor: number) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [campo]: valor };
      return { ...f, items };
    });
  }

  // ── Abrir formulario nuevo ───────────────────────────────────────────────────

  function openNew() {
    setEditPedidoId(null);
    setEditLegacyId(null);
    setForm(emptyForm);
    setBuscarProducto('');
    setBuscarCliente('');
    setOpen(true);
  }

  // ── Abrir edición de pedido ──────────────────────────────────────────────────

  function openEditPedido(p: Pedido) {
    setEditPedidoId(p.id);
    setEditLegacyId(null);
    if (p.tipo_ingreso === 'mensualidad') {
      setForm({
        ...emptyForm,
        tipo_ingreso: 'mensualidad',
        fecha: p.fecha,
        cliente: p.cliente ?? '',
        cliente_id: p.cliente_id ?? '',
        mes_mensualidad: p.mes_mensualidad ? p.mes_mensualidad.slice(0, 7) : mesActual(),
        monto_mensualidad: Number(p.total),
        medio_cobro: p.medio_cobro,
      });
    } else {
      setForm({
        ...emptyForm,
        tipo_ingreso: 'esporadico',
        fecha: p.fecha,
        cliente: p.cliente ?? '',
        cliente_id: p.cliente_id ?? '',
        notas: p.notas ?? '',
        medio_cobro: p.medio_cobro,
        descuento_tipo: p.descuento_porcentaje > 0 ? 'porcentaje' : 'monto',
        descuento_valor: p.descuento_porcentaje > 0 ? p.descuento_porcentaje : p.descuento_monto,
        items: p.items.map(i => ({
          producto_id: i.producto_id,
          nombre: i.productos?.nombre ?? '',
          cantidad: i.cantidad,
          precio_unitario: Number(i.precio_unitario),
        })),
      });
    }
    setBuscarProducto('');
    setBuscarCliente('');
    setOpen(true);
  }

  // ── Abrir edición de venta legacy ────────────────────────────────────────────

  function openEditLegacy(v: VentaLegacy) {
    setEditLegacyId(v.id);
    setEditPedidoId(null);
    setLegacyForm({
      producto_id: v.producto_id,
      cantidad: v.cantidad,
      precio_unitario: Number(v.precio_unitario),
      medio_cobro: v.medio_cobro,
      fecha: v.fecha,
    });
    setBuscarLegacy(v.productos?.nombre ?? '');
    setOpen(true);
  }

  // ── Guardar pedido (nuevo o edición) ─────────────────────────────────────────

  async function handleSubmitMensualidad() {
    if (!form.cliente.trim()) { toast.error('Elegí o creá el cliente'); return; }
    if (!form.monto_mensualidad || form.monto_mensualidad <= 0) { toast.error('Ingresá el monto de la mensualidad'); return; }
    const payload = {
      fecha: form.fecha,
      cliente: form.cliente,
      cliente_id: form.cliente_id || null,
      medio_cobro: form.medio_cobro,
      tipo_ingreso: 'mensualidad',
      mes_mensualidad: form.mes_mensualidad ? `${form.mes_mensualidad}-01` : null,
      subtotal: form.monto_mensualidad,
      descuento_monto: 0,
      descuento_porcentaje: 0,
      total: form.monto_mensualidad,
    };
    if (editPedidoId) {
      const { error } = await supabase.from('pedidos').update(payload).eq('id', editPedidoId);
      if (error) { toast.error(error.message); return; }
      toast.success('Mensualidad actualizada');
    } else {
      const { error } = await supabase.from('pedidos').insert({ ...payload, user_id: user!.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Mensualidad registrada');
    }
    setOpen(false);
    setForm(emptyForm);
    load();
  }

  async function handleSubmitPedido(e: React.FormEvent) {
    e.preventDefault();
    if (form.tipo_ingreso === 'mensualidad') { await handleSubmitMensualidad(); return; }
    if (form.items.length === 0) { toast.error('Agregá al menos un producto'); return; }

    const { subtotal, descuento_monto, descuento_porcentaje, total } = calcTotales(
      form.items, form.descuento_tipo, form.descuento_valor
    );

    const factor = subtotal > 0 ? total / subtotal : 1;

    try {
      if (editPedidoId) {
        // EDICIÓN: revertir stock de items anteriores, borrar ventas, reinsertar
        const pedidoActual = pedidos.find(p => p.id === editPedidoId);
        if (pedidoActual) {
          for (const item of pedidoActual.items) {
            const prod = productos.find(p => p.id === item.producto_id);
            if (prod) {
              await supabase.from('productos').update({ stock_actual: prod.stock_actual + item.cantidad }).eq('id', prod.id);
            }
          }
          await supabase.from('ventas').delete().eq('pedido_id', editPedidoId);
        }

        // Actualizar pedido
        const { error: errPedido } = await supabase.from('pedidos').update({
          fecha: form.fecha,
          cliente: form.cliente || null,
          cliente_id: form.cliente_id || null,
          notas: form.notas || null,
          medio_cobro: form.medio_cobro,
          tipo_ingreso: 'esporadico',
          mes_mensualidad: null,
          subtotal,
          descuento_monto,
          descuento_porcentaje,
          total,
        }).eq('id', editPedidoId);
        if (errPedido) throw errPedido;

        // Reinsertar ventas
        for (const item of form.items) {
          const itemTotal = Math.round(item.cantidad * item.precio_unitario * factor * 100) / 100;
          const { error } = await supabase.from('ventas').insert({
            user_id: user!.id,
            pedido_id: editPedidoId,
            producto_id: item.producto_id,
            fecha: form.fecha,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            total: itemTotal,
            medio_cobro: form.medio_cobro,
          });
          if (error) throw error;

          // Descontar stock actualizado
          const prodActualizado = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
          if (prodActualizado.data) {
            await supabase.from('productos').update({ stock_actual: prodActualizado.data.stock_actual - item.cantidad }).eq('id', item.producto_id);
            await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: item.producto_id, tipo: 'venta', cantidad: -item.cantidad, notas: `Venta${form.cliente ? ` - ${form.cliente}` : ''}` });
          }
        }
        toast.success('Venta actualizada');

      } else {
        // NUEVO pedido
        const { data: pedidoData, error: errPedido } = await supabase.from('pedidos').insert({
          user_id: user!.id,
          fecha: form.fecha,
          cliente: form.cliente || null,
          cliente_id: form.cliente_id || null,
          notas: form.notas || null,
          medio_cobro: form.medio_cobro,
          subtotal,
          descuento_monto,
          descuento_porcentaje,
          total,
        }).select('id').single();
        if (errPedido || !pedidoData) throw errPedido ?? new Error('No se pudo crear el pedido');

        for (const item of form.items) {
          const itemTotal = Math.round(item.cantidad * item.precio_unitario * factor * 100) / 100;
          const { error } = await supabase.from('ventas').insert({
            user_id: user!.id,
            pedido_id: pedidoData.id,
            producto_id: item.producto_id,
            fecha: form.fecha,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            total: itemTotal,
            medio_cobro: form.medio_cobro,
          });
          if (error) throw error;

          const prod = productos.find(p => p.id === item.producto_id);
          if (prod) {
            await supabase.from('productos').update({ stock_actual: prod.stock_actual - item.cantidad }).eq('id', prod.id);
            await supabase.from('stock_movimientos').insert({ user_id: user!.id, producto_id: prod.id, tipo: 'venta', cantidad: -item.cantidad, notas: `Venta${form.cliente ? ` - ${form.cliente}` : ''}` });
          }
        }
        toast.success('Venta registrada');
      }

      setOpen(false);
      setForm(emptyForm);
      load(); loadProductos();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar');
    }
  }

  // ── Guardar venta legacy (edición) ───────────────────────────────────────────

  async function handleSubmitLegacy(e: React.FormEvent) {
    e.preventDefault();
    if (!legacyForm.producto_id) { toast.error('Seleccioná un producto'); return; }
    const total = legacyForm.cantidad * legacyForm.precio_unitario;
    const { error } = await supabase.from('ventas').update({
      fecha: legacyForm.fecha,
      producto_id: legacyForm.producto_id,
      cantidad: legacyForm.cantidad,
      precio_unitario: legacyForm.precio_unitario,
      total,
      medio_cobro: legacyForm.medio_cobro,
    }).eq('id', editLegacyId!);
    if (error) { toast.error(error.message); return; }
    toast.success('Venta actualizada');
    setOpen(false);
    load();
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.tipo === 'pedido') {
      const { error } = await supabase.from('pedidos').delete().eq('id', deleteTarget.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('ventas').delete().eq('id', deleteTarget.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success('Venta eliminada');
    setDeleteTarget(null);
    load();
  }

  // ── Filtros y stats ───────────────────────────────────────────────────────────

  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(buscarProducto.toLowerCase())
  );

  const entradas: EntradaLista[] = [
    ...pedidos.map(p => ({ tipo: 'pedido' as const, data: p, _fecha: p.fecha })),
    ...legacyVentas.map(v => ({ tipo: 'legacy' as const, data: v, _fecha: v.fecha })),
  ].sort((a, b) => b._fecha.localeCompare(a._fecha));

  const entradasFiltradas = entradas.filter(e => {
    const q = search.toLowerCase();
    if (e.tipo === 'pedido') {
      return (e.data.cliente ?? '').toLowerCase().includes(q) ||
        e.data.items.some(i => (i.productos?.nombre ?? '').toLowerCase().includes(q));
    }
    return (e.data.productos?.nombre ?? '').toLowerCase().includes(q);
  });

  const totalGeneral = entradasFiltradas.reduce((s, e) => s + Number(e.data.total), 0);
  const totalMensualidad = entradasFiltradas
    .filter(e => e.tipo === 'pedido' && e.data.tipo_ingreso === 'mensualidad')
    .reduce((s, e) => s + Number(e.data.total), 0);
  const totalEsporadico = totalGeneral - totalMensualidad;
  const byMedio: Record<string, number> = {};
  entradasFiltradas.forEach(e => {
    const medio = e.data.medio_cobro;
    byMedio[medio] = (byMedio[medio] ?? 0) + Number(e.data.total);
  });

  const { subtotal: formSubtotal, descuento_monto: formDescMonto, total: formTotal } = calcTotales(
    form.items, form.descuento_tipo, form.descuento_valor
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nueva venta</Button>
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditPedidoId(null); setEditLegacyId(null); setBuscarProducto(''); setBuscarCliente(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editLegacyId ? 'Editar venta' : editPedidoId ? 'Editar pedido' : 'Registrar venta'}
            </DialogTitle>
            <DialogDescription>
              {editLegacyId ? 'Modificá los datos de la venta.' : editPedidoId ? 'Modificá el pedido.' : 'Agregá productos y un descuento opcional.'}
            </DialogDescription>
          </DialogHeader>

          {/* Formulario legacy (edición de venta vieja) */}
          {editLegacyId ? (
            <form onSubmit={handleSubmitLegacy} className="space-y-3">
              <div><Label>Fecha</Label><Input type="date" value={legacyForm.fecha} onChange={e => setLegacyForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar..." value={buscarLegacy}
                    onChange={e => { setBuscarLegacy(e.target.value); setLegacyForm(f => ({ ...f, producto_id: '' })); }}
                    className="pl-9" />
                </div>
                {buscarLegacy && !legacyForm.producto_id && (
                  <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto">
                    {productos.filter(p => p.nombre.toLowerCase().includes(buscarLegacy.toLowerCase())).map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                        onClick={() => { setLegacyForm(f => ({ ...f, producto_id: p.id, precio_unitario: p.precio_venta })); setBuscarLegacy(p.nombre); }}>
                        <span>{p.nombre}</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(p.precio_venta)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {legacyForm.producto_id && <p className="text-xs text-primary px-1">✓ {productos.find(p => p.id === legacyForm.producto_id)?.nombre}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cantidad</Label><Input type="number" min={1} value={legacyForm.cantidad} onChange={e => setLegacyForm(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))} /></div>
                <div><Label>Precio unit.</Label><Input type="number" step="0.01" value={legacyForm.precio_unitario} onChange={e => setLegacyForm(f => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="text-sm font-medium">Total: {formatCurrency(legacyForm.cantidad * legacyForm.precio_unitario)}</div>
              <div><Label>Medio de cobro</Label>
                <Select value={legacyForm.medio_cobro} onValueChange={v => setLegacyForm(f => ({ ...f, medio_cobro: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Guardar cambios</Button>
            </form>
          ) : (
            /* Formulario pedido (nuevo o edición de pedido) */
            <form onSubmit={handleSubmitPedido} className="space-y-4">
              {/* Esporádica vs Mensualidad */}
              <Tabs value={form.tipo_ingreso} onValueChange={v => setForm(f => ({ ...f, tipo_ingreso: v as TipoIngreso }))}>
                <TabsList className="w-full">
                  <TabsTrigger value="esporadico" className="flex-1">Esporádica</TabsTrigger>
                  <TabsTrigger value="mensualidad" className="flex-1">Mensualidad</TabsTrigger>
                </TabsList>
              </Tabs>

              {form.tipo_ingreso === 'mensualidad' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Cliente mensualizado</Label>
                    {form.cliente_id || form.cliente ? (
                      <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                        <span className="font-medium">{form.cliente}</span>
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, cliente_id: '', cliente: '' }))}>Cambiar</button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Buscar o escribir nombre..." value={buscarCliente}
                          onChange={e => setBuscarCliente(e.target.value)}
                          className="pl-9" />
                        {buscarCliente && (
                          <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto mt-1">
                            {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).map(c => (
                              <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                                onClick={() => seleccionarCliente(c)}>
                                <span>{c.nombre}</span>
                                {c.monto_mensual != null && <span className="text-xs text-muted-foreground">{formatCurrency(c.monto_mensual)}</span>}
                              </button>
                            ))}
                            {!clientes.some(c => normalizarNombre(c.nombre) === normalizarNombre(buscarCliente)) && (
                              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-primary" onClick={() => crearYSeleccionarCliente(true)}>
                                + Crear cliente "{buscarCliente}"
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Mes</Label><Input type="month" value={form.mes_mensualidad} onChange={e => setForm(f => ({ ...f, mes_mensualidad: e.target.value }))} /></div>
                    <div><Label>Monto</Label><Input type="number" step="0.01" value={form.monto_mensualidad || ''} onChange={e => setForm(f => ({ ...f, monto_mensualidad: parseFloat(e.target.value) || 0 }))} /></div>
                  </div>
                  <div><Label>Fecha de pago</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
                </div>
              ) : (
              <>
              <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>

              {/* Cliente */}
              <div className="space-y-1">
                <Label>Cliente (opcional)</Label>
                {form.cliente_id ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                    <span className="font-medium">{form.cliente}</span>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, cliente_id: '', cliente: '' }))}>Cambiar</button>
                  </div>
                ) : (
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar o escribir nombre..." value={buscarCliente || form.cliente}
                      onChange={e => { setBuscarCliente(e.target.value); setForm(f => ({ ...f, cliente: e.target.value })); }}
                      className="pl-9" />
                    {buscarCliente && (
                      <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto mt-1">
                        {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).map(c => (
                          <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => seleccionarCliente(c)}>
                            <span>{c.nombre}</span>
                            {c.es_mensual && <span className="text-xs text-muted-foreground ml-2">mensual</span>}
                          </button>
                        ))}
                        {!clientes.some(c => normalizarNombre(c.nombre) === normalizarNombre(buscarCliente)) && (
                          <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-primary" onClick={() => crearYSeleccionarCliente(false)}>
                            + Crear cliente "{buscarCliente}"
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {form.cliente_id && clientes.find(c => c.id === form.cliente_id)?.notas && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap">📝 {clientes.find(c => c.id === form.cliente_id)?.notas}</p>
                )}
              </div>

              {/* Buscador de productos */}
              <div className="space-y-1">
                <Label>Agregar producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar producto..." value={buscarProducto}
                    onChange={e => setBuscarProducto(e.target.value)}
                    className="pl-9" />
                </div>
                {buscarProducto && productosFiltrados.length > 0 && (
                  <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto">
                    {productosFiltrados.map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center"
                        onClick={() => agregarItem(p)}>
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-xs text-muted-foreground">stock: {p.stock_actual} · {formatCurrency(p.precio_venta)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {buscarProducto && productosFiltrados.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">No se encontraron productos</p>
                )}
              </div>

              {/* Lista de items */}
              {form.items.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Producto</th>
                        <th className="text-center px-2 py-2 font-medium w-16">Cant.</th>
                        <th className="text-right px-2 py-2 font-medium w-24">P.Unit.</th>
                        <th className="text-right px-2 py-2 font-medium w-24">Subtotal</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {form.items.map((item, idx) => (
                        <tr key={item.producto_id}>
                          <td className="px-3 py-2 text-sm">{item.nombre}</td>
                          <td className="px-2 py-1">
                            <Input type="number" min={1} value={item.cantidad}
                              onChange={e => actualizarItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                              className="h-7 text-center w-16 text-xs" />
                          </td>
                          <td className="px-2 py-1">
                            <Input type="number" step="0.01" value={item.precio_unitario}
                              onChange={e => actualizarItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                              className="h-7 text-right w-24 text-xs" />
                          </td>
                          <td className="px-2 py-2 text-right text-xs font-medium">
                            {formatCurrency(item.cantidad * item.precio_unitario)}
                          </td>
                          <td className="px-1 py-1">
                            <button type="button" onClick={() => quitarItem(idx)}
                              className="text-muted-foreground hover:text-destructive p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Descuento */}
              {form.items.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Descuento</Label>
                  <div className="flex gap-2 items-center">
                    <Select value={form.descuento_tipo} onValueChange={(v: 'porcentaje' | 'monto') => setForm(f => ({ ...f, descuento_tipo: v, descuento_valor: 0 }))}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="porcentaje">% Porc.</SelectItem>
                        <SelectItem value="monto">$ Monto</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} step={form.descuento_tipo === 'porcentaje' ? '0.1' : '1'}
                      max={form.descuento_tipo === 'porcentaje' ? 100 : formSubtotal}
                      placeholder={form.descuento_tipo === 'porcentaje' ? '0%' : '$0'}
                      value={form.descuento_valor || ''}
                      onChange={e => setForm(f => ({ ...f, descuento_valor: parseFloat(e.target.value) || 0 }))}
                      className="flex-1" />
                  </div>
                  {formDescMonto > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Descuento: -{formatCurrency(formDescMonto)}
                    </p>
                  )}
                </div>
              )}

              {/* Notas del pedido */}
              <div className="space-y-1">
                <Label>Notas del pedido (opcional)</Label>
                <Textarea rows={2} placeholder="Ej: ensalada sin cebolla, entregar el viernes..."
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
              </>
              )}

              {/* Medio de cobro */}
              <div>
                <Label>Medio de cobro</Label>
                <Select value={form.medio_cobro} onValueChange={v => setForm(f => ({ ...f, medio_cobro: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Totales */}
              {form.tipo_ingreso === 'mensualidad' ? (
                form.monto_mensualidad > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 flex justify-between font-semibold text-base">
                    <span>MENSUALIDAD</span><span className="text-primary">{formatCurrency(form.monto_mensualidad)}</span>
                  </div>
                )
              ) : form.items.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span>{formatCurrency(formSubtotal)}</span>
                  </div>
                  {formDescMonto > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Descuento</span><span className="text-red-500">-{formatCurrency(formDescMonto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-base border-t pt-1 mt-1">
                    <span>TOTAL</span><span className="text-primary">{formatCurrency(formTotal)}</span>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={form.tipo_ingreso === 'mensualidad' ? !form.cliente.trim() || form.monto_mensualidad <= 0 : form.items.length === 0}>
                {editPedidoId ? 'Guardar cambios' : form.tipo_ingreso === 'mensualidad' ? 'Registrar mensualidad' : 'Registrar venta'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminar ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
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

      {/* ── Buscador + acciones ──────────────────────────────────────────────── */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente o producto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          const rows = entradasFiltradas.flatMap(e => {
            if (e.tipo === 'pedido' && e.data.tipo_ingreso === 'mensualidad') {
              return [{
                Fecha: e.data.fecha,
                Cliente: e.data.cliente ?? '',
                Producto: `Mensualidad ${e.data.mes_mensualidad?.slice(0, 7) ?? ''}`,
                Cantidad: 1,
                'Precio Unit': e.data.total,
                'Total Item': e.data.total,
                'Total Pedido': e.data.total,
                Descuento: 0,
                Medio: e.data.medio_cobro,
              }];
            }
            if (e.tipo === 'pedido') {
              return e.data.items.map(i => ({
                Fecha: e.data.fecha,
                Cliente: e.data.cliente ?? '',
                Producto: i.productos?.nombre ?? '',
                Cantidad: i.cantidad,
                'Precio Unit': i.precio_unitario,
                'Total Item': i.total,
                'Total Pedido': e.data.total,
                Descuento: e.data.descuento_monto,
                Medio: e.data.medio_cobro,
              }));
            }
            return [{ Fecha: e.data.fecha, Cliente: '', Producto: e.data.productos?.nombre ?? '', Cantidad: e.data.cantidad, 'Precio Unit': e.data.precio_unitario, 'Total Item': e.data.total, 'Total Pedido': e.data.total, Descuento: 0, Medio: e.data.medio_cobro }];
          });
          exportToCSV(rows, 'ventas');
        }}>
          <Download className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Resumen ──────────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-4 text-sm">
        <span className="font-medium">Total: {formatCurrency(totalGeneral)}</span>
        <span className="text-muted-foreground">Esporádicas: {formatCurrency(totalEsporadico)}</span>
        {totalMensualidad > 0 && <span className="text-muted-foreground">Mensualidad: {formatCurrency(totalMensualidad)}</span>}
        {Object.entries(byMedio).map(([k, v]) => (
          <span key={k} className="text-muted-foreground">{k}: {formatCurrency(v)}</span>
        ))}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {entradasFiltradas.map(entrada => {
          if (entrada.tipo === 'pedido') {
            const p = entrada.data;
            const esMensualidad = p.tipo_ingreso === 'mensualidad';
            const tieneDescuento = p.descuento_monto > 0;
            return (
              <div key={`pedido-${p.id}`} className="bg-card rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.cliente && (
                        <span className="font-semibold text-sm flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />{p.cliente}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(p.fecha)}</span>
                      <span className="text-xs text-muted-foreground">· {p.medio_cobro}</span>
                      {esMensualidad
                        ? <Badge variant="secondary" className="text-xs">Mensualidad{p.mes_mensualidad ? ` · ${p.mes_mensualidad.slice(0, 7)}` : ''}</Badge>
                        : p.items.length > 1 && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.items.length} productos</span>
                        )}
                    </div>
                    {/* Items en línea */}
                    {!esMensualidad && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {p.items.map(i => `${i.productos?.nombre ?? '?'} ×${i.cantidad}`).join(' · ')}
                      </p>
                    )}
                    {/* Descuento */}
                    {!esMensualidad && tieneDescuento && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Subtotal {formatCurrency(p.subtotal)}
                        {' · '}
                        <span className="text-red-500">
                          Desc. {p.descuento_porcentaje > 0 ? `${Math.round(p.descuento_porcentaje)}%` : ''} -{formatCurrency(p.descuento_monto)}
                        </span>
                      </p>
                    )}
                    {p.notas && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic whitespace-pre-wrap">📝 {p.notas}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className="font-semibold text-sm">{formatCurrency(Number(p.total))}</p>
                    <Button variant="ghost" size="sm" onClick={() => openEditPedido(p)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ tipo: 'pedido', id: p.id })} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </div>
            );
          }

          // Legacy venta
          const v = entrada.data;
          return (
            <div key={`legacy-${v.id}`} className="bg-card rounded-lg border p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{v.productos?.nombre}</p>
                <p className="text-xs text-muted-foreground">{formatDate(v.fecha)} · {v.cantidad} × {formatCurrency(Number(v.precio_unitario))} · {v.medio_cobro}</p>
              </div>
              <p className="font-semibold text-sm shrink-0">{formatCurrency(Number(v.total))}</p>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEditLegacy(v)}><Edit2 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ tipo: 'legacy', id: v.id })} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          );
        })}
        {entradasFiltradas.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">No hay ventas registradas</p>
        )}
      </div>
    </div>
  );
}
