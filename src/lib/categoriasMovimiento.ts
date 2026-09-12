// Taxonomía curada de categorías para movimientos NO comerciales (todo lo que no es
// venta de comida ni gasto operativo directo: familiares, deudas, inversión/ahorro,
// transferencias entre cuentas propias). El campo movimientos.categoria es texto libre
// en la base (no hay lista fija), así que además de esto siempre existe "Otra (especificar)".

export interface OpcionCategoria {
  value: string;       // lo que se guarda en movimientos.categoria
  label: string;        // lo que ve Pilar
  subcategoria?: string; // detalle opcional (ej: "Pago de intereses")
  afectaCaja: boolean;
  afectaResultado: boolean;
}

export interface GrupoCategoria {
  grupo: string;
  opciones: OpcionCategoria[];
}

export const CATEGORIAS_MOVIMIENTO: GrupoCategoria[] = [
  {
    grupo: 'Familiares y pareja',
    opciones: [
      { value: 'movimiento_facundo', label: 'Pilar–Facu', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Mamá', subcategoria: 'Mamá', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Julieta', subcategoria: 'Julieta', afectaCaja: true, afectaResultado: false },
      { value: 'reintegro_natura', label: 'Natura', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Ayuda familiar', subcategoria: 'Ayuda familiar', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Préstamo familiar', subcategoria: 'Préstamo familiar', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Reintegro familiar', subcategoria: 'Reintegro familiar', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_familiar', label: 'Movimiento familiar sin clasificar', afectaCaja: true, afectaResultado: false },
    ],
  },
  {
    grupo: 'Deudas',
    opciones: [
      { value: 'prestamo_recibido', label: 'Préstamo recibido', afectaCaja: true, afectaResultado: false },
      { value: 'prestamo_recibido', label: 'Nueva deuda', subcategoria: 'Nueva deuda', afectaCaja: true, afectaResultado: false },
      { value: 'pago_prestamo', label: 'Pago de capital', subcategoria: 'Capital', afectaCaja: true, afectaResultado: false },
      { value: 'pago_prestamo', label: 'Pago de intereses', subcategoria: 'Intereses', afectaCaja: true, afectaResultado: true },
      { value: 'pago_prestamo', label: 'Comisión bancaria', subcategoria: 'Comisión bancaria', afectaCaja: true, afectaResultado: true },
      { value: 'pago_prestamo', label: 'Refinanciación', subcategoria: 'Refinanciación', afectaCaja: true, afectaResultado: false },
      { value: 'pago_prestamo', label: 'Deuda pendiente', subcategoria: 'Deuda pendiente', afectaCaja: false, afectaResultado: false },
    ],
  },
  {
    grupo: 'Inversión y ahorro',
    opciones: [
      { value: 'inversion_ahorro', label: 'Inversión financiera', subcategoria: 'Inversión financiera', afectaCaja: true, afectaResultado: false },
      { value: 'inversion_ahorro', label: 'Compra de equipamiento', subcategoria: 'Compra de equipamiento', afectaCaja: true, afectaResultado: false },
      { value: 'inversion_ahorro', label: 'Mejoras del negocio', subcategoria: 'Mejoras del negocio', afectaCaja: true, afectaResultado: false },
      { value: 'inversion_ahorro', label: 'Fondo de reserva', subcategoria: 'Fondo de reserva', afectaCaja: true, afectaResultado: false },
      { value: 'inversion_ahorro', label: 'Compra de moneda extranjera', subcategoria: 'Compra de moneda extranjera', afectaCaja: true, afectaResultado: false },
      { value: 'inversion_ahorro', label: 'Otros ahorros o inversiones', afectaCaja: true, afectaResultado: false },
    ],
  },
  {
    grupo: 'Alquiler, envíos y otros',
    opciones: [
      { value: 'alquiler', label: 'Aporte para alquiler', afectaCaja: true, afectaResultado: false },
      { value: 'movimiento_interno', label: 'Transferencia entre cuentas propias', afectaCaja: false, afectaResultado: false },
      { value: 'envio_cobrado', label: 'Envío cobrado', afectaCaja: true, afectaResultado: true },
      { value: 'compras_varias', label: 'Compras varias', afectaCaja: true, afectaResultado: true },
      { value: 'movimientos_varios', label: 'Movimientos varios', afectaCaja: true, afectaResultado: true },
      { value: 'pendiente_clasificar', label: 'Pendiente de clasificar', afectaCaja: true, afectaResultado: true },
    ],
  },
];

export const CATEGORIA_MOV_LABEL: Record<string, string> = {
  prestamo_recibido: 'Préstamo recibido',
  pago_prestamo: 'Pago de préstamo',
  movimiento_facundo: 'Pilar–Facu',
  reintegro_natura: 'Natura',
  movimiento_familiar: 'Movimiento familiar',
  alquiler: 'Alquiler',
  envio_cobrado: 'Envío cobrado',
  pendiente_clasificar: 'Pendiente de clasificar',
  movimiento_interno: 'Transferencia entre cuentas propias',
  compras_varias: 'Compras varias',
  movimientos_varios: 'Movimientos varios',
  inversion_ahorro: 'Inversión / ahorro',
};

export const CUENTAS = ['Mercado Pago', 'Brubank', 'Efectivo', 'Banco', 'Otra'];

// Desde junio 2026, un envio de Pilar a Facu se sugiere como aporte al alquiler por defecto.
export function sugerirCategoriaFacu(fecha: string): OpcionCategoria {
  const esDesdeJunio2026 = fecha >= '2026-06-01';
  return esDesdeJunio2026
    ? { value: 'alquiler', label: 'Aporte para alquiler', afectaCaja: true, afectaResultado: false }
    : { value: 'movimiento_facundo', label: 'Pilar–Facu', afectaCaja: true, afectaResultado: false };
}
