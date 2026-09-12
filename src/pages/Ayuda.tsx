import { ArrowDown, ShoppingCart, Receipt, ArrowLeftRight, Landmark, Package, Info } from 'lucide-react';

const PASOS = [
  { icon: ShoppingCart, texto: 'Venta a un cliente', destino: 'Registrar como venta del mes', color: 'text-primary' },
  { icon: Receipt, texto: 'Compra o pago del negocio', destino: 'Registrar como gasto del mes', color: 'text-destructive' },
  { icon: ArrowLeftRight, texto: 'Plata entre tus propias cuentas', destino: 'Registrar como transferencia interna (Movimientos)', color: 'text-muted-foreground' },
  { icon: Landmark, texto: 'Préstamo o pago de deuda', destino: 'Actualizar la deuda (Deudas o Movimientos)', color: 'text-amber-500' },
  { icon: Package, texto: 'Retiro de comida para vos', destino: 'Elegí "Consumo personal" en Mi Sueldo', color: 'text-primary' },
];

const AYUDAS: { seccion: string; texto: string }[] = [
  { seccion: 'Ventas', texto: 'Registrá únicamente dinero generado por clientes. No incluyas préstamos ni transferencias propias.' },
  { seccion: 'Gastos', texto: 'Registrá pagos relacionados con el funcionamiento del negocio.' },
  { seccion: 'Movimientos → Inversión y ahorro', texto: 'Dinero destinado a generar valor futuro; no confundir con un gasto habitual.' },
  { seccion: 'Movimientos → Transferencia entre cuentas propias', texto: 'Mueve dinero entre tus cuentas y no modifica el resultado del negocio.' },
  { seccion: 'Deudas', texto: 'Los préstamos recibidos aumentan la deuda. El pago de capital la reduce.' },
  { seccion: 'Mi Sueldo → Consumo personal', texto: 'Retiro de productos del negocio para uso propio. Baja el stock y se registra como sueldo en especie, sin movimiento de efectivo.' },
  { seccion: 'Movimientos → Familiares', texto: 'Dinero enviado o recibido de familiares que no constituye una venta del negocio.' },
  { seccion: 'Selector de mes', texto: 'Un mes sin registros muestra "Sin datos cargados". Un mes marcado como incompleto no debe compararse como un período cerrado.' },
];

export default function Ayuda() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Cómo usar la aplicación</h1>
        <p className="text-muted-foreground text-sm">Guía rápida para saber dónde cargar cada movimiento.</p>
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-3">
        <p className="text-sm font-medium mb-1">¿Qué movimiento es?</p>
        {PASOS.map((p, i) => (
          <div key={i}>
            <div className="flex items-center gap-3 rounded-md border p-3">
              <p.icon className={`w-5 h-5 shrink-0 ${p.color}`} />
              <div>
                <p className="text-sm font-medium">{p.texto}</p>
                <p className="text-xs text-muted-foreground">→ {p.destino}</p>
              </div>
            </div>
            {i < PASOS.length - 1 && <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-muted-foreground" /></div>}
          </div>
        ))}
        <div className="flex justify-center pt-1"><ArrowDown className="w-4 h-4 text-muted-foreground" /></div>
        <div className="rounded-md border-2 border-dashed p-3 text-center text-xs text-muted-foreground">
          Ninguno de estos pasos infla ni duplica el resultado del negocio: cada uno cae en un balde distinto.
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Qué va en cada sección</h2>
        {AYUDAS.map(a => (
          <div key={a.seccion} className="bg-card rounded-lg border p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{a.seccion}</p>
              <p className="text-xs text-muted-foreground">{a.texto}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
