import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tag, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { parseListaPrecios, normalizarNombre } from '@/lib/importParser';
import { actualizarPrecioCosto } from '@/lib/precios';

interface ProductoLite { id: string; nombre: string; precio_costo: number; }

interface FilaEditable {
  _key: string;
  _incluir: boolean;
  nombre: string;
  precio: number;
  productoId?: string;
  precioAnterior?: number;
  buscar: string;
}

let contador = 0;
const nuevoKey = () => `p${++contador}`;

function buscarCoincidencia(nombre: string, productos: ProductoLite[]): ProductoLite | undefined {
  const n = normalizarNombre(nombre);
  const exacto = productos.find(p => normalizarNombre(p.nombre) === n);
  if (exacto) return exacto;
  const candidatos = productos.filter(p => {
    const pn = normalizarNombre(p.nombre);
    return pn.includes(n) || n.includes(pn);
  });
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

export default function ActualizarPrecios({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [filas, setFilas] = useState<FilaEditable[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setTexto(''); setFilas([]);
    supabase.from('productos').select('id, nombre, precio_costo').eq('user_id', user.id).order('nombre').then(({ data }) => {
      setProductos((data as ProductoLite[]) ?? []);
    });
  }, [open, user]);

  function interpretar() {
    const crudas = parseListaPrecios(texto);
    if (crudas.length === 0) { toast.error('No se reconoció ningún precio. Probá: "pollo $4.500, lentejas $11.000"'); return; }
    const eds: FilaEditable[] = crudas.map(f => {
      const match = buscarCoincidencia(f.nombre, productos);
      return {
        _key: nuevoKey(),
        _incluir: true,
        nombre: match?.nombre ?? f.nombre,
        precio: f.precio,
        productoId: match?.id,
        precioAnterior: match?.precio_costo,
        buscar: '',
      };
    });
    setFilas(eds);
  }

  function editar(key: string, campos: Partial<FilaEditable>) {
    setFilas(fs => fs.map(f => f._key === key ? { ...f, ...campos } : f));
  }
  function quitar(key: string) {
    setFilas(fs => fs.filter(f => f._key !== key));
  }
  function vincular(key: string, p: ProductoLite) {
    editar(key, { productoId: p.id, nombre: p.nombre, precioAnterior: p.precio_costo, buscar: '' });
  }

  async function confirmar() {
    if (!user) return;
    const incluidas = filas.filter(f => f._incluir);
    if (incluidas.length === 0) { toast.error('No hay filas para aplicar'); return; }
    setGuardando(true);

    await supabase.from('importaciones').insert({
      user_id: user.id,
      tipo: 'precios',
      origen: 'texto',
      estado: 'confirmado',
      crudo: texto.slice(0, 5000),
      payload: { filas: incluidas } as any,
    });

    let actualizados = 0, sinCambios = 0, sinVincular = 0, errores = 0;
    for (const f of incluidas) {
      if (!f.productoId) { sinVincular++; continue; }
      try {
        const { cambiado } = await actualizarPrecioCosto(user.id, f.productoId, f.precio, 'texto');
        cambiado ? actualizados++ : sinCambios++;
      } catch {
        errores++;
      }
    }
    toast.success(`${actualizados} precios actualizados` + (sinCambios ? ` · ${sinCambios} sin cambios` : '') + (sinVincular ? ` · ${sinVincular} sin vincular` : '') + (errores ? ` · ${errores} con error` : ''));
    setGuardando(false);
    setOpen(false);
    onDone();
  }

  const totalIncluidas = filas.filter(f => f._incluir).length;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Tag className="w-4 h-4 mr-1" /> Actualizar precios
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Actualizar precios</DialogTitle>
            <DialogDescription>Pegá los precios nuevos y confirmá el cambio antes de guardar.</DialogDescription>
          </DialogHeader>

          {filas.length === 0 ? (
            <div className="space-y-2">
              <Textarea
                rows={5}
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={'Pollo ahora $4.500 el kilo, lentejas $11.000, huevos $8.000 el maple'}
              />
              <p className="text-xs text-muted-foreground">Un precio por línea o separados por coma. Nombre y precio nuevo; no hace falta la unidad.</p>
              <Button className="w-full" onClick={interpretar} disabled={!texto.trim()}>Interpretar</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{filas.length} precios · {totalIncluidas} a aplicar</span>
                <Button variant="ghost" size="sm" onClick={() => setFilas([])}>Volver</Button>
              </div>

              <div className="space-y-2">
                {filas.map(f => {
                  const candidatos = f.buscar
                    ? productos.filter(p => normalizarNombre(p.nombre).includes(normalizarNombre(f.buscar))).slice(0, 5)
                    : [];
                  return (
                    <div key={f._key} className={`rounded-lg border p-2.5 space-y-1.5 ${f._incluir ? '' : 'opacity-50'}`}>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={f._incluir} onCheckedChange={v => editar(f._key, { _incluir: !!v })} />
                        <span className="flex-1 text-sm font-medium truncate">{f.nombre}</span>
                        <button onClick={() => quitar(f._key)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex items-center gap-2 pl-6 text-sm">
                        {f.precioAnterior !== undefined
                          ? <span className="text-muted-foreground">{formatCurrency(f.precioAnterior)}</span>
                          : <Badge variant="outline" className="text-xs">Sin vincular</Badge>}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <Input type="number" step="0.01" value={f.precio} onChange={e => editar(f._key, { precio: parseFloat(e.target.value) || 0 })} className="h-7 w-28" />
                      </div>
                      {!f.productoId && (
                        <div className="pl-6 space-y-1">
                          <Input placeholder="Buscar producto para vincular..." value={f.buscar} onChange={e => editar(f._key, { buscar: e.target.value })} className="h-8" />
                          {candidatos.length > 0 && (
                            <div className="border rounded-md bg-card shadow-sm">
                              {candidatos.map(p => (
                                <button key={p.id} type="button" className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted flex justify-between"
                                  onClick={() => vincular(f._key, p)}>
                                  <span>{p.nombre}</span>
                                  <span className="text-muted-foreground">{formatCurrency(p.precio_costo)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button className="w-full" onClick={confirmar} disabled={guardando || totalIncluidas === 0}>
                {guardando ? 'Aplicando...' : `Aplicar ${totalIncluidas}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
