import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function inicioMes(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }

export function rangoMes(d: Date) {
  const y = d.getFullYear(), m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`;
  return { start, end };
}

export function labelMes(d: Date) {
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Props {
  mes: Date;
  onChange: (mes: Date) => void;
  bloquearFuturo?: boolean;
}

// Selector de mes/año reutilizable: Inicio, Movimientos, etc. se filtran por esto.
export default function MesSelector({ mes, onChange, bloquearFuturo = true }: Props) {
  const esMesActual = mes.getFullYear() === new Date().getFullYear() && mes.getMonth() === new Date().getMonth();
  return (
    <div className="flex items-center justify-between bg-card rounded-lg border p-2">
      <Button variant="ghost" size="sm" onClick={() => onChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="font-medium text-sm">{labelMes(mes)}</span>
      <Button variant="ghost" size="sm" disabled={bloquearFuturo && esMesActual} onClick={() => onChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
