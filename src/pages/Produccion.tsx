import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, X, Copy, ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import {
  parseIngredientesTexto, buscarProductoPorNombre, calcularCostoItem, calcularNivelPrecision,
  LABEL_PRECISION, registrarProduccion, cargarProducciones, cargarItemsProduccion,
  type NivelPrecision, type ProduccionResumen,
} from '@/lib/produccion';

interface ProductoLite {
  id: string; nombre: string; unidad_medida: string; unidad_uso: string | null;
  equivalencia_uso: number | null; precio_costo: number; clase: string | null;
}

interface FilaIngrediente {
  _key: string;
  _incluir: boolean;
  nombre: string;
  cantidad?: number;
  unidad?: string;
  productoId?: string;
  costo?: number | null;
  cantidadConvertida?: number | null;
  buscar: string;
}

let contador = 0;
const nuevoKey = () => `i${++contador}`;

const UNIDADES_SELECT = ['kg', 'g', 'litro', 'ml', 'unidad', 'docena', 'maple', 'paquete', 'porción'];

const emptyForm = {
  productoId: '',
  cantidadObtenida: '' as string | number,
  fecha: new Date().toISOString().split('T')[0],
  notas: '',
  textoIngredientes: '',
};

export default function Produccion() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [producciones, setProducciones] = useState<ProduccionResumen[]>([]);
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<'armar' | 'revisar'>('armar');
  const [form, setForm] = useState(emptyForm);
  const [buscarProducto, setBuscarProducto] = useState('');
  const [filas, setFilas] = useState<FilaIngrediente[]>([]);
  const [actualizarCosto, setActualizarCosto] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (user) { cargar(); cargarCatalogo(); } }, [user]);

  async function cargar() {
    setProducciones(await cargarProducciones(user!.id));
  }
  async function cargarCatalogo() {
    const { data } = await supabase.from('productos').select('id, nombre, unidad_medida, unidad_uso, equivalencia_uso, precio_costo, clase').eq('user_id', user!.id).eq('activo', true);
    setProductos((data as any) ?? []);
  }

  const productoElegido = productos.find(p => p.id === form.productoId);
  const productosAProducir = productos.filter(p => p.clase === 'elaborado' || p.clase === 'base');
  const productosFiltrados = productosAProducir.filter(p => p.nombre.toLowerCase().includes(buscarProducto.toLowerCase()));

  function abrirNueva() {
    setForm(emptyForm);
    setBuscarProducto('');
    setFilas([]);
    setActualizarCosto(true);
    setPaso('armar');
    setOpen(true);
  }

  function recalcularFila(f: FilaIngrediente): FilaIngrediente {
    const prod = f.productoId ? productos.find(p => p.id === f.productoId) : undefined;
    if (!prod) return { ...f, costo: null, cantidadConvertida: null };
    const { cantidadConvertida, costo } = calcularCostoItem(f.cantidad, f.unidad, prod);
    return { ...f, cantidadConvertida, costo };
  }

  function interpretar() {
    if (!form.productoId) { toast.error('Elegí qué producto vas a producir'); return; }
    if (!form.cantidadObtenida) { toast.error('Indicá cuántas unidades obtuviste'); return; }
    const candidatos = productos.filter(p => p.id !== form.productoId);
    const parseadas = parseIngredientesTexto(form.textoIngredientes);
    const eds: FilaIngrediente[] = parseadas.map(ing => {
      const match = buscarProductoPorNombre(ing.nombre, candidatos);
      const base: FilaIngrediente = {
        _key: nuevoKey(), _incluir: true, nombre: match?.nombre ?? ing.nombre,
        cantidad: ing.cantidad, unidad: ing.unidad, productoId: match?.id, buscar: '',
      };
      return recalcularFila(base);
    });
    setFilas(eds);
    setPaso('revisar');
  }

  function agregarFilaManual() {
    setFilas(fs => [...fs, { _key: nuevoKey(), _incluir: true, nombre: '', buscar: '' }]);
  }

  function editarFila(key: string, campos: Partial<FilaIngrediente>) {
    setFilas(fs => fs.map(f => f._key === key ? recalcularFila({ ...f, ...campos }) : f));
  }
  function quitarFila(key: string) {
    setFilas(fs => fs.filter(f => f._key !== key));
  }
  function vincularFila(key: string, p: ProductoLite) {
    editarFila(key, { productoId: p.id, nombre: p.nombre, buscar: '', unidad: p.unidad_uso ?? p.unidad_medida });
  }

  const costoTotal = filas.filter(f => f._incluir).reduce((s, f) => s + (f.costo ?? 0), 0);
  const cantidadNum = parseFloat(String(form.cantidadObtenida)) || 0;
  const costoUnitario = costoTotal > 0 && cantidadNum > 0 ? costoTotal / cantidadNum : null;
  const nivelPrecision: NivelPrecision = calcularNivelPrecision(filas.filter(f => f._incluir).map(f => ({ costo: f.costo ?? null })));

  async function confirmar() {
    if (!user || !productoElegido) return;
    if (cantidadNum <= 0) { toast.error('La cantidad obtenida tiene que ser mayor a 0'); return; }
    setGuardando(true);
    try {
      const incluidas = filas.filter(f => f._incluir && f.nombre.trim());
      const { nivelPrecision: nivel } = await registrarProduccion({
        userId: user.id,
        productoId: productoElegido.id,
        productoNombre: productoElegido.nombre,
        fecha: form.fecha,
        cantidadObtenida: cantidadNum,
        items: incluidas.map(f => ({ nombre: f.nombre, cantidad: f.cantidad, unidad: f.unidad, productoId: f.productoId, cantidadConvertida: f.cantidadConvertida, costo: f.costo })),
        notas: form.notas,
        actualizarCostoProducto: actualizarCosto,
      });
      toast.success(`Producción registrada · ${LABEL_PRECISION[nivel]}`);
      setOpen(false);
      cargar(); cargarCatalogo();
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo registrar la producción');
    } finally {
      setGuardando(false);
    }
  }

  async function repetir(p: ProduccionResumen) {
    const prod = productos.find(pr => pr.id === p.producto_id);
    if (!prod) return;
    const items = await cargarItemsProduccion(p.id);
    setForm({ productoId: p.producto_id, cantidadObtenida: p.cantidad_obtenida, fecha: new Date().toISOString().split('T')[0], notas: '', textoIngredientes: '' });
    setBuscarProducto('');
    const eds = items.map(it => {
      const ingProd = it.ingrediente_id ? productos.find(pr => pr.id === it.ingrediente_id) : undefined;
      return recalcularFila({
        _key: nuevoKey(), _incluir: true, nombre: ingProd?.nombre ?? it.nombre_libre ?? '',
        cantidad: it.cantidad ?? undefined, unidad: it.unidad ?? undefined, productoId: it.ingrediente_id ?? undefined, buscar: '',
      });
    });
    setFilas(eds);
    setActualizarCosto(true);
    setPaso('revisar');
    setOpen(true);
  }

  const badgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = { preciso: 'default', estimado: 'secondary', sin_calcular: 'outline' };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Producción</h1>
        <Button size="sm" onClick={abrirNueva}><Plus className="w-4 h-4 mr-1" /> Nueva producción</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva producción</DialogTitle>
            <DialogDescription>Contá qué produjiste y con qué. Si faltan datos, igual queda registrado como estimado.</DialogDescription>
          </DialogHeader>

          {paso === 'armar' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>¿Qué produjiste?</Label>
                {productoElegido ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                    <span className="font-medium">{productoElegido.nombre}</span>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, productoId: '' }))}>Cambiar</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar producto o base..." value={buscarProducto} onChange={e => setBuscarProducto(e.target.value)} className="pl-9" />
                    {buscarProducto && (
                      <div className="border rounded-md bg-card shadow-sm max-h-40 overflow-y-auto mt-1">
                        {productosFiltrados.slice(0, 8).map(p => (
                          <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => { setForm(f => ({ ...f, productoId: p.id })); setBuscarProducto(''); }}>
                            {p.nombre}
                          </button>
                        ))}
                        {productosFiltrados.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cantidad obtenida{productoElegido ? ` (${productoElegido.unidad_medida})` : ''}</Label>
                  <Input type="number" step="0.01" value={form.cantidadObtenida} onChange={e => setForm(f => ({ ...f, cantidadObtenida: e.target.value }))} placeholder="Ej: 42" />
                </div>
                <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              </div>

              <div className="space-y-1">
                <Label>Ingredientes usados</Label>
                <Textarea rows={4} value={form.textoIngredientes} onChange={e => setForm(f => ({ ...f, textoIngredientes: e.target.value }))}
                  placeholder={'Usé 2kg de lentejas, 700g de arroz, 8 huevos y verduras'} />
                <p className="text-xs text-muted-foreground">Si no sabés la cantidad exacta de algo, escribilo igual sin número — no hace falta que esté completo.</p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setFilas([]); setPaso('revisar'); }}>Cargar ingredientes a mano</Button>
                <Button type="button" className="flex-1" onClick={interpretar}>Interpretar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{productoElegido?.nombre} · {form.cantidadObtenida} {productoElegido?.unidad_medida}</span>
                <Button variant="ghost" size="sm" onClick={() => setPaso('armar')}>Volver</Button>
              </div>

              <div className="space-y-2">
                {filas.map(f => {
                  const candidatos = f.buscar ? productos.filter(p => p.id !== form.productoId && p.nombre.toLowerCase().includes(f.buscar.toLowerCase())).slice(0, 5) : [];
                  return (
                    <div key={f._key} className={`rounded-lg border p-2.5 space-y-1.5 ${f._incluir ? '' : 'opacity-50'}`}>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={f._incluir} onCheckedChange={v => editarFila(f._key, { _incluir: !!v })} />
                        <Input value={f.nombre} onChange={e => editarFila(f._key, { nombre: e.target.value })} placeholder="Ingrediente" className="h-8 flex-1" />
                        <button onClick={() => quitarFila(f._key)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-6">
                        <Input type="number" step="0.01" placeholder="Cantidad" value={f.cantidad ?? ''} onChange={e => editarFila(f._key, { cantidad: e.target.value ? parseFloat(e.target.value) : undefined })} className="h-8" />
                        <Select value={f.unidad ?? 'ninguna'} onValueChange={v => editarFila(f._key, { unidad: v === 'ninguna' ? undefined : v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Unidad" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ninguna">Unidad</SelectItem>
                            {UNIDADES_SELECT.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pl-6 flex items-center justify-between gap-2 text-xs">
                        {f.productoId
                          ? <span className="text-muted-foreground">{f.costo != null ? `Costo: ${formatCurrency(f.costo)}` : 'No se pudo calcular el costo'}</span>
                          : <Badge variant="outline" className="text-xs">Sin vincular · no descuenta stock</Badge>}
                      </div>
                      {!f.productoId && (
                        <div className="pl-6 space-y-1">
                          <Input placeholder="Vincular a un ingrediente cargado..." value={f.buscar} onChange={e => editarFila(f._key, { buscar: e.target.value })} className="h-8" />
                          {candidatos.length > 0 && (
                            <div className="border rounded-md bg-card shadow-sm">
                              {candidatos.map(p => (
                                <button key={p.id} type="button" className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted" onClick={() => vincularFila(f._key, p)}>{p.nombre}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={agregarFilaManual}><Plus className="w-4 h-4 mr-1" /> Agregar ingrediente</Button>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Costo total estimado</span><span>{costoTotal > 0 ? formatCurrency(costoTotal) : '—'}</span></div>
                <div className="flex justify-between font-medium"><span>Costo por {productoElegido?.unidad_medida ?? 'unidad'}</span><span>{costoUnitario != null ? formatCurrency(costoUnitario) : '—'}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Nivel de precisión</span><Badge variant={badgeVariant[nivelPrecision]}>{LABEL_PRECISION[nivelPrecision]}</Badge></div>
              </div>

              {costoUnitario != null && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={actualizarCosto} onCheckedChange={v => setActualizarCosto(!!v)} />
                  <Label className="text-xs font-normal">Actualizar el costo de {productoElegido?.nombre} con este valor</Label>
                </div>
              )}

              <div><Label>Notas (opcional)</Label><Input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>

              <Button className="w-full" onClick={confirmar} disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar producción'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {producciones.map(p => (
          <div key={p.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><ChefHat className="w-4 h-4 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{p.productos?.nombre ?? 'Producto eliminado'}</p>
                <Badge variant={badgeVariant[p.nivel_precision] ?? 'outline'} className="text-xs">{LABEL_PRECISION[p.nivel_precision as NivelPrecision] ?? p.nivel_precision}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(p.fecha)} · {p.cantidad_obtenida} {p.productos?.unidad_medida}
                {p.costo_unitario != null && ` · ${formatCurrency(p.costo_unitario)} c/u`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => repetir(p)}><Copy className="w-3.5 h-3.5 mr-1" /> Repetir</Button>
          </div>
        ))}
        {producciones.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Todavía no hay producciones registradas</p>}
      </div>
    </div>
  );
}
