import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Ajustes() {
  const { user } = useAuth();
  const [nombre, setNombre] = useState('Mundo Prana');
  const [meta, setMeta] = useState(300000);

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

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <Card>
        <CardHeader><CardTitle className="text-lg">Configuración general</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre del negocio</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} /></div>
          <div><Label>Meta de sueldo mensual (ARS)</Label><Input type="number" step="1000" value={meta} onChange={e => setMeta(parseFloat(e.target.value) || 0)} /></div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Moneda: ARS (Pesos argentinos)</p>
            <p>Formato fecha: DD/MM/AAAA</p>
          </div>
          <Button onClick={save}>Guardar cambios</Button>
        </CardContent>
      </Card>
    </div>
  );
}
