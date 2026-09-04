import Papa from 'papaparse';

// Fila normalizada que sale de cualquier origen (texto pegado o CSV).
export interface FilaImport {
  nombre: string;
  precio?: number;        // precio de venta / precio del plato
  precio_costo?: number;
  tipo?: 'fresco' | 'congelado';
  categoria?: 'vegetariano' | 'carne';
  fecha?: string;         // yyyy-mm-dd (para menús de mediodía)
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function normalizarNombre(s: string): string {
  return sinAcentos(s).trim().replace(/\s+/g, ' ');
}

// Parsea precios en formato argentino: "$10.000", "10.000,50", "8000", "1.234"
export function parsePrecioAR(raw: string): number | undefined {
  if (!raw) return undefined;
  const limpio = raw.replace(/[^\d.,]/g, '');
  if (!limpio) return undefined;

  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');
  let num: string;

  if (tienePunto && tieneComa) {
    // punto = miles, coma = decimal
    num = limpio.replace(/\./g, '').replace(',', '.');
  } else if (tieneComa) {
    num = limpio.replace(',', '.');
  } else if (tienePunto) {
    const partes = limpio.split('.');
    const ultima = partes[partes.length - 1];
    // un solo punto con 1-2 decimales => decimal; si no, separador de miles
    if (partes.length === 2 && ultima.length > 0 && ultima.length <= 2) {
      num = limpio;
    } else {
      num = limpio.replace(/\./g, '');
    }
  } else {
    num = limpio;
  }

  const v = parseFloat(num);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

// Detecta tipo / categoría a partir de palabras sueltas
function clasificar(texto: string): Pick<FilaImport, 'tipo' | 'categoria'> {
  const t = sinAcentos(texto);
  const out: Pick<FilaImport, 'tipo' | 'categoria'> = {};
  if (/\bcongel/.test(t)) out.tipo = 'congelado';
  else if (/\bfresc/.test(t)) out.tipo = 'fresco';
  if (/\bvegetarian|\bveggie|\bvegan|\bverdur/.test(t)) out.categoria = 'vegetariano';
  else if (/\bcarne|\bpollo|\bcerdo|\bvacun|\bbife|\bmilanesa/.test(t)) out.categoria = 'carne';
  return out;
}

const ENCABEZADOS = /^(producto|productos|plato|nombre|precio|costo|categor|tipo|dia|fecha|item)/i;

function parseFecha(raw: string): string | undefined {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
}

// ─── Texto pegado ─────────────────────────────────────────────────────────────

export function parseTexto(texto: string): FilaImport[] {
  const filas: FilaImport[] = [];
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (!l || ENCABEZADOS.test(l)) continue;

    // ¿está separado por comas / tab / punto y coma / " - "?
    const partes = l.split(/\s*[,;\t]\s*|\s+[-–]\s+/).map(p => p.trim()).filter(Boolean);

    if (partes.length > 1) {
      const fila: FilaImport = { nombre: partes[0] };
      for (const p of partes.slice(1)) {
        const precio = /\$|\d/.test(p) && !/[a-zA-Z]{4,}/.test(p) ? parsePrecioAR(p) : undefined;
        if (precio !== undefined && fila.precio === undefined) { fila.precio = precio; continue; }
        const c = clasificar(p);
        if (c.tipo) fila.tipo = c.tipo;
        if (c.categoria) fila.categoria = c.categoria;
      }
      if (fila.nombre) filas.push(fila);
      continue;
    }

    // texto libre: "Hamburguesa de lentejas $10.000 congelada vegetariana"
    const mPrecio = l.match(/\$\s*[\d.,]+|\b\d{3,}([.,]\d+)?\b/);
    let nombre = l;
    let resto = '';
    if (mPrecio && mPrecio.index !== undefined) {
      nombre = l.slice(0, mPrecio.index).replace(/[-–,:]\s*$/, '').trim();
      resto = l.slice(mPrecio.index + mPrecio[0].length);
    }
    const fila: FilaImport = { nombre: nombre || l };
    if (mPrecio) fila.precio = parsePrecioAR(mPrecio[0]);
    const c = clasificar(l);
    if (c.tipo) fila.tipo = c.tipo;
    if (c.categoria) fila.categoria = c.categoria;
    // limpiar palabras clave que quedaron pegadas al nombre
    fila.nombre = fila.nombre.replace(/\b(congelad[oa]s?|fresc[oa]s?|vegetarian[oa]s?|veggie|carne)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || l;
    void resto;
    if (fila.nombre) filas.push(fila);
  }
  return filas;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const COL = {
  nombre: /(nombre|producto|plato|item|descrip)/i,
  precio: /(precio|valor|pvp|venta)/i,
  costo: /(costo|compra)/i,
  tipo: /(tipo|estado|congel)/i,
  categoria: /(categor|dieta)/i,
  fecha: /(fecha|dia|día)/i,
};

export function parseCSV(texto: string): FilaImport[] {
  const res = Papa.parse<string[]>(texto, { skipEmptyLines: 'greedy' });
  const rows = (res.data as string[][]).filter(r => r.some(c => (c ?? '').trim() !== ''));
  if (rows.length === 0) return [];

  const head = rows[0].map(h => (h ?? '').trim());
  const pareceHeader = head.some(h => COL.nombre.test(h) || COL.precio.test(h) || COL.categoria.test(h));

  const idx = { nombre: 0, precio: -1, costo: -1, tipo: -1, categoria: -1, fecha: -1 };
  let dataRows = rows;
  if (pareceHeader) {
    head.forEach((h, i) => {
      (Object.keys(COL) as (keyof typeof COL)[]).forEach(k => {
        if (COL[k].test(h) && idx[k] === (k === 'nombre' ? 0 : -1)) idx[k] = i;
      });
    });
    if (!head.some(h => COL.nombre.test(h))) idx.nombre = 0;
    dataRows = rows.slice(1);
  } else {
    // posicional: nombre, precio, tipo, categoria
    idx.precio = head.length > 1 ? 1 : -1;
    idx.tipo = head.length > 2 ? 2 : -1;
    idx.categoria = head.length > 3 ? 3 : -1;
  }

  const filas: FilaImport[] = [];
  for (const r of dataRows) {
    const nombre = (r[idx.nombre] ?? '').trim();
    if (!nombre) continue;
    const fila: FilaImport = { nombre };
    if (idx.precio >= 0) fila.precio = parsePrecioAR(r[idx.precio] ?? '');
    if (idx.costo >= 0) fila.precio_costo = parsePrecioAR(r[idx.costo] ?? '');
    if (idx.tipo >= 0) fila.tipo = clasificar(r[idx.tipo] ?? '').tipo;
    if (idx.categoria >= 0) fila.categoria = clasificar(r[idx.categoria] ?? '').categoria;
    if (idx.fecha >= 0) fila.fecha = parseFecha(r[idx.fecha] ?? '');
    filas.push(fila);
  }
  return filas;
}
