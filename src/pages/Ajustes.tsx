import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type SeccionBorrar = 'ventas' | 'gastos_negocio' | 'gastos_personal' | 'sueldo' | null;

const SECCIONES: { key: SeccionBorrar; label: string; descripcion: string }[] = [
  { key: 'ventas', label: 'Todas las ventas', descripcion: 'Se eliminarán todas las ventas registradas.' },
  { key: 'gastos_negocio', label: 'Gastos del negocio', descripcion: 'Se eliminarán todos los gastos del negocio.' },
  { key: 'gastos_personal', label: 'Gastos personales', descripcion: 'Se eliminarán todos los gastos personales.' },
  { key: 'sueldo', label: 'Historial de sueldo', descripcion: 'Se eliminarán todos los retiros de sueldo.' },
];

export default function Ajustes() {
  const { user } = useAuth();
  const [nombre, setNombre] = useState('Mundo Prana');
  const [meta, setMeta] = useState(300000);
  const [confirmBorrar, setConfirmBorrar] = useState<SeccionBorrar>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('ajustes_usuario').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) { setNombre(data.nombre_negocio); setMeta(data.meta_sueldo_mensual); }
    });
  }, [user]);

  async function save() {
    const { error } = await supabase.from('ajustes_usuario').update({ nombre_negocio: nombre, meta_sueldo_mensual: meta }).eq('user_id', user!.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Ajustes guardados');
  }

  async function handleBorrar() {
    if (!confirmBorrar || !user) return;
    setLoading(true);

    let error = null;

    if (confirmBorrar === 'ventas') {
      ({ error } = await supabase.from('ventas').delete().eq('user_id', user.id));
    } else if (confirmBorrar === 'gastos_negocio') {
      ({ error } = await supabase.from('gastos').delete().eq('user_id', user.id).eq('tipo', 'negocio'));
    } else if (confirmBorrar === 'gastos_personal') {
      ({ error } = await supabase.from('gastos').delete().eq('user_id', user.id).eq('tipo', 'personal'));
    } else if (confirmBorrar === 'sueldo') {
      ({ error } = await supabase.from('sueldo_retiros').delete().eq('user_id', user.id));
    }

    setLoading(false);
    if (error) { toast.error(error.message); return; }

    const seccion = SECCIONES.find(s => s.key === confirmBorrar);
    toast.success(`${seccion?.label} eliminado(s) correctamente`);
    setConfirmBorrar(null);
  }

  const seccionActual = SECCIONES.find(s => s.key === confirmBorrar);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Configuración general */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Configuración general</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre del negocio</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} /></div>
          <div>
            <Label>Meta de sueldo mensual (ARS)</Label>
            <Input type="number" step="1000" value={meta} onChange={e => setMeta(parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground mt-1">Esta meta se muestra como barra de progreso en "Mi Sueldo"</p>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Moneda: ARS (Pesos argentinos)</p>
            <p>Formato fecha: DD/MM/AAAA</p>
          </div>
          <Button onClick={save}>Guardar cambios</Button>
        </CardContent>
      </Card>

      {/* Zona de peligro */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Zona de peligro
          </CardTitle>
          <p className="text-sm text-muted-foreground">Estas acciones eliminan datos permanentemente y no se pueden deshacer.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {SECCIONES.map((s, i) => (
            <div key={s.key}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.descripcion}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => setConfirmBorrar(s.key)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Borrar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog de confirmación */}
      <AlertDialog open={!!confirmBorrar} onOpenChange={open => !open && setConfirmBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {seccionActual?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {seccionActual?.descripcion} Esta acción <strong>no se puede deshacer</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBorrar}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? 'Eliminando...' : 'Sí, eliminar todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}