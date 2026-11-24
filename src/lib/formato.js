const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmt2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** USD 12.345 (sin decimales si son ,00). */
export const usd = (v) => (v == null || v === '' ? '—' : `${Number(v) < 0 ? '−' : ''}${fmt.format(Math.abs(Number(v)))}`);
export const usd2 = (v) => (v == null || v === '' ? '—' : fmt2.format(Number(v)));

export const fecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const mes = (ym) => (ym === 'sin-fecha' ? 'Sin fecha' : ym ? `${MESES[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}` : '—');

export const hoy = () => new Date().toLocaleDateString('sv-SE');

/** Convierte un texto con formato argentino ("1.234,5") o normal a número; '' → null. */
export function aNumero(t) {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s) return null;
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const v = Number(limpio);
  return Number.isFinite(v) ? v : null;
}
