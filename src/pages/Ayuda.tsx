import { ArrowDown, ArrowRight, ShoppingCart, Receipt, ArrowLeftRight, Landmark, Package, Info, Carrot, Calculator, ChefHat, TrendingUp, BarChart3, Wallet } from 'lucide-react';

function Nodo({ icon: Icon, texto, sub, color = 'text-foreground' }: { icon: any; texto: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border p-2.5 bg-card">
      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight">{texto}</p>
        {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

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

      <div className="bg-card rounded-lg border p-4 space-y-4">
        <p className="text-sm font-medium">Cómo se conecta todo</p>

        {/* A: de la materia prima al precio */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">De la materia prima al precio de venta</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={Carrot} texto="Materia prima" sub="Productos → Materia prima" />
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Nodo icon={Calculator} texto="Receta" sub="Costos" />
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Nodo icon={ShoppingCart} texto="Precio sugerido" sub="lo usás en Ventas" color="text-primary" />
          </div>
        </div>

        {/* B: producción */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cuando cocinás</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={Carrot} texto="Materia prima" />
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Nodo icon={ChefHat} texto="Producción" sub="descuenta stock" />
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Nodo icon={Package} texto="Stock de productos" sub="lo que hay para vender" />
          </div>
        </div>

        {/* C: del mes al resultado */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cada mes</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={ShoppingCart} texto="Ventas" sub="mensualidad + esporádicas" color="text-primary" />
          </div>
          <div className="flex justify-center"><ArrowDown className="w-3.5 h-3.5 text-muted-foreground" /></div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={Receipt} texto="Gastos" sub="mercadería + otros gastos" color="text-destructive" />
          </div>
          <div className="flex justify-center"><ArrowDown className="w-3.5 h-3.5 text-muted-foreground" /></div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={TrendingUp} texto="Resultado del negocio" sub="ingresos − mercadería − gastos − sueldo" />
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Nodo icon={BarChart3} texto="Estadísticas" sub="compara un mes con otro" />
          </div>
        </div>

        {/* D: aparte */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Aparte — no es venta ni gasto del negocio</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Nodo icon={Wallet} texto="Mi Sueldo" sub="lo que retirás" color="text-muted-foreground" />
            <Nodo icon={ArrowLeftRight} texto="Movimientos" sub="Facu, préstamos, inversión" color="text-muted-foreground" />
            <Nodo icon={Landmark} texto="Deudas" sub="pagar una cuota sí es gasto" color="text-muted-foreground" />
          </div>
        </div>
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
