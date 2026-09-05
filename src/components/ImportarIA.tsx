import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Upload, X, Camera, Mic, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseTexto, parseCSV, normalizarNombre, type FilaImport } from '@/lib/importParser';

type Target = 'productos' | 'menu';
type Origen = 'texto' | 'csv' | 'imagen';

interface MenuLite { id: string; nombre: string; tipo: string; }

interface FilaEditable extends FilaImport {
  _key: string;
  _incluir: boolean;
  _existeId?: string;          // id del producto existente con el mismo nombre
  _accion: 'crear' | 'actualizar' | 'mantener';
}

let contador = 0;
const nuevoKey = () => `f${++contador}`;

export default function ImportarIA({ target, onDone }: { target: Target; onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [origen, setOrigen] = useState<Origen>('texto');
  const [texto, setTexto] = useState('');
  const [archivoNombre, setArchivoNombre] = useState('');
  const [filas, setFilas] = useState<FilaEditable[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [menus, setMenus] = useState<MenuLite[]>([]);
  const [menuId, setMenuId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const imagenRef = useRef<HTMLInputElement>(null);

  // productos existentes para detectar duplicados
  const [existentes, setExistentes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !user) return;
    setFilas([]); setTexto(''); setArchivoNombre('');
    if (target === 'productos') {
      supabase.from('productos').select('id, nombre').eq('user_id', user.id).then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((p: any) => { map[normalizarNombre(p.nombre)] = p.id; });
        setExistentes(map);
      });
    } else {
      supabase.from('menus').select('id, nombre, tipo').eq('user_id', user.id).order('mes', { ascending: false, nullsFirst: false }).then(({ data }) => {
        setMenus((data as any) ?? []);
        if (data && data.length && !menuId) setMenuId(data[0].id);
      });
    }
  }, [open, user, target]);

  const menuActual = menus.find(m => m.id === menuId);
  const esMenuMediodia = menuActual?.tipo === 'mediodia';

  function construirFilas(crudas: FilaImport[]) {
    if (crudas.length === 0) { toast.error('No se reconoció ninguna fila. Revisá el formato.'); return; }
    const eds: FilaEditable[] = crudas.map(f => {
      const existeId = target === 'productos' ? existentes[normalizarNombre(f.nombre)] : undefined;
      return { ...f, _key: nuevoKey(), _incluir: true, _existeId: existeId, _accion: existeId ? 'mantener' : 'crear' };
    });
    setFilas(eds);
  }

  function interpretar() {
    construirFilas(origen === 'texto' ? parseTexto(texto) : parseCSV(texto));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoNombre(file.name);
    const txt = await file.text();
    setTexto(txt);
    setOrigen('csv');
  }

  function archivoABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoNombre(file.name);
    setAnalizando(true);
    try {
      const base64 = await archivoABase64(file);
      const { data, error } = await supabase.functions.invoke('parse-productos-imagen', {
        body: { base64, mimeType: file.type },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      const crudas: FilaImport[] = (data?.productos ?? []).map((p: any) => ({
        nombre: p.nombre,
        precio: p.precio_venta ?? undefined,
        tipo: p.tipo ?? undefined,
        categoria: p.categoria ?? undefined,
      }));
      construirFilas(crudas);
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo analizar el archivo');
    } finally {
      setAnalizando(false);
    }
  }

  function editar(key: string, campos: Partial<FilaEditable>) {
    setFilas(fs => fs.map(f => f._key === key ? { ...f, ...campos } : f));
  }
  function quitar(key: string) {
    setFilas(fs => fs.filter(f => f._key !== key));
  }

  async function importar() {
    if (!user) return;
    const incluidas = filas.filter(f => f._incluir && f.nombre.trim());
    if (incluidas.length === 0) { toast.error('No hay filas para importar'); return; }
    if (target === 'menu' && !menuId) { toast.error('Elegí un menú'); return; }
    setGuardando(true);

    // registro de auditoría: la IA no escribe directo, queda el rastro de lo confirmado
    await supabase.from('importaciones').insert({
      user_id: user.id,
      tipo: target === 'productos' ? 'productos' : 'menu',
      origen,
      estado: 'confirmado',
      crudo: origen === 'texto' ? texto.slice(0, 5000) : archivoNombre,
      payload: { filas: incluidas } as any,
    });

    let creados = 0, actualizados = 0, saltados = 0, errores = 0;

    if (target === 'productos') {
      for (const f of incluidas) {
        if (f._existeId && f._accion === 'mantener') { saltados++; continue; }
        if (f._existeId && f._accion === 'actualizar') {
          const { error } = await supabase.from('productos').update({
            precio_venta: f.precio ?? undefined,
            tipo: f.tipo ?? undefined,
            categoria: f.categoria ?? null,
            precio_costo: f.precio_costo ?? undefined,
          }).eq('id', f._existeId);
          if (error) errores++; else actualizados++;
          continue;
        }
        const { error } = await supabase.from('productos').insert({
          user_id: user.id,
          nombre: f.nombre.trim(),
          clase: 'elaborado',
          es_materia_prima: false,
          tipo: f.tipo ?? 'fresco',
          categoria: f.categoria ?? null,
          precio_costo: f.precio_costo ?? 0,
          precio_venta: f.precio ?? 0,
          precio_venta_manual: true,
          stock_actual: 0,
          unidad_medida: 'unidad',
          alerta_stock_bajo: 5,
          activo: true,
        });
        if (error) errores++; else creados++;
      }
      toast.success(`${creados} creados · ${actualizados} actualizados · ${saltados} sin cambios${errores ? ` · ${errores} con error` : ''}`);
    } else {
      // menú
      const { data: existentesItems } = await supabase.from('menu_items').select('id').eq('menu_id', menuId);
      let orden = existentesItems?.length ?? 0;
      const rows = incluidas.map(f => ({
        user_id: user.id,
        menu_id: menuId,
        nombre_plato: f.nombre.trim(),
        producto_id: null,
        fecha: esMenuMediodia ? (f.fecha ?? null) : null,
        categoria: f.categoria ?? null,
        precio: f.precio ?? null,
        orden: orden++,
      }));
      const { error } = await supabase.from('menu_items').insert(rows);
      if (error) { errores = rows.length; } else { creados = rows.length; }
      toast.success(`${creados} platos agregados al menú${errores ? ` · ${errores} con error` : ''}`);
    }

    setGuardando(false);
    setOpen(false);
    onDone();
  }

  const totalIncluidas = filas.filter(f => f._incluir).length;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Sparkles className="w-4 h-4 mr-1" /> Importar con IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar {target === 'productos' ? 'productos' : 'platos al menú'}</DialogTitle>
            <DialogDescription>
              Pegá una lista o subí un CSV. Se muestra una previsualización para revisar antes de guardar.
            </DialogDescription>
          </DialogHeader>

          {target === 'menu' && (
            <div>
              <Label>Menú destino</Label>
              <Select value={menuId} onValueChange={setMenuId}>
                <SelectTrigger><SelectValue placeholder="Elegí un menú" /></SelectTrigger>
                <SelectContent>
                  {menus.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {menus.length === 0 && <p className="text-xs text-muted-foreground mt-1">Primero creá un menú.</p>}
            </div>
          )}

          {filas.length === 0 ? (
            <Tabs value={origen} onValueChange={v => setOrigen(v as Origen)}>
              <TabsList className="w-full">
                <TabsTrigger value="texto" className="flex-1">Pegar texto</TabsTrigger>
                <TabsTrigger value="csv" className="flex-1">CSV</TabsTrigger>
                <TabsTrigger value="imagen" className="flex-1">Foto/PDF</TabsTrigger>
              </TabsList>
              <TabsContent value="texto" className="space-y-2">
                <Textarea
                  rows={7}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  placeholder={'Hamburguesa de lentejas, $10.000, congelada, vegetariana\nTarta integral 10000 congelada\nMilanesa de pollo x4 - 8500 - carne'}
                />
                <p className="text-xs text-muted-foreground">Una línea por producto. El nombre primero; precio, tipo (fresco/congelado) y categoría (vegetariano/carne) en cualquier orden.</p>
                <Button className="w-full" onClick={interpretar} disabled={!texto.trim() || (target === 'menu' && !menuId)}>Interpretar</Button>
              </TabsContent>
              <TabsContent value="csv" className="space-y-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={onFile} />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> {archivoNombre || 'Elegir archivo CSV'}
                </Button>
                <p className="text-xs text-muted-foreground">Desde Excel o Google Sheets: Archivo → Descargar → CSV. Se reconocen columnas Nombre, Precio, Tipo, Categoría{target === 'menu' ? ', Fecha' : ''}.</p>
                <Button className="w-full" onClick={interpretar} disabled={!texto.trim() || (target === 'menu' && !menuId)}>Interpretar</Button>
              </TabsContent>
              <TabsContent value="imagen" className="space-y-2">
                <input ref={imagenRef} type="file" accept="image/*,.pdf" hidden onChange={onImagen} disabled={target === 'menu' && !menuId} />
                <Button type="button" variant="outline" className="w-full" onClick={() => imagenRef.current?.click()} disabled={analizando || (target === 'menu' && !menuId)}>
                  {analizando
                    ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Analizando...</>
                    : <><Camera className="w-4 h-4 mr-1" /> {archivoNombre || 'Subir foto o PDF'}</>}
                </Button>
                <p className="text-xs text-muted-foreground">Subí una foto de la carta o un PDF. La IA identifica los productos; después revisás y confirmás antes de guardar.</p>
              </TabsContent>

              <div className="flex items-center gap-2 pt-1 opacity-60">
                <Badge variant="outline" className="gap-1"><Mic className="w-3 h-3" /> Voz — próximamente</Badge>
              </div>
            </Tabs>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{filas.length} filas · {totalIncluidas} a importar</span>
                <Button variant="ghost" size="sm" onClick={() => setFilas([])}>Volver</Button>
              </div>

              <div className="space-y-2">
                {filas.map(f => (
                  <div key={f._key} className={`rounded-lg border p-2.5 space-y-2 ${f._incluir ? '' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={f._incluir} onCheckedChange={v => editar(f._key, { _incluir: !!v })} />
                      <Input value={f.nombre} onChange={e => editar(f._key, { nombre: e.target.value })} className="h-8 flex-1" />
                      <button onClick={() => quitar(f._key)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <Input type="number" step="0.01" placeholder="Precio" value={f.precio ?? ''} onChange={e => editar(f._key, { precio: e.target.value ? parseFloat(e.target.value) : undefined })} className="h-8" />
                      {target === 'menu' && esMenuMediodia
                        ? <Input type="date" value={f.fecha ?? ''} onChange={e => editar(f._key, { fecha: e.target.value || undefined })} className="h-8" />
                        : <Select value={f.tipo ?? 'ninguno'} onValueChange={v => editar(f._key, { tipo: v === 'ninguno' ? undefined : v as any })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ninguno">Tipo</SelectItem>
                              <SelectItem value="fresco">Fresco</SelectItem>
                              <SelectItem value="congelado">Congelado</SelectItem>
                            </SelectContent>
                          </Select>}
                      <Select value={f.categoria ?? 'ninguna'} onValueChange={v => editar(f._key, { categoria: v === 'ninguna' ? undefined : v as any })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguna">Categoría</SelectItem>
                          <SelectItem value="vegano">Vegano</SelectItem>
                          <SelectItem value="vegetariano">Vegetariano</SelectItem>
                          <SelectItem value="carne">Carne</SelectItem>
                        </SelectContent>
                      </Select>
                      {f._existeId
                        ? <Select value={f._accion} onValueChange={v => editar(f._key, { _accion: v as any })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mantener">Ya existe: mantener</SelectItem>
                              <SelectItem value="actualizar">Ya existe: actualizar</SelectItem>
                              <SelectItem value="crear">Crear igual</SelectItem>
                            </SelectContent>
                          </Select>
                        : <div className="flex items-center"><Badge variant="secondary" className="text-xs">Nuevo</Badge></div>}
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={importar} disabled={guardando || totalIncluidas === 0}>
                {guardando ? 'Importando...' : `Importar ${totalIncluidas}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
