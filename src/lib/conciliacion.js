// Conciliación con el estado de cuenta que manda Magrausa (xlsx "Emisión de Estados de Cuenta").
// Columnas: RUBRO, NOMBRE, CODIGO, NOMBRE, Fecha, Asiento, Documento, Detalle, Débitos, Créditos, Saldo, F. Valor.
// En las dos cuentas (deudores y proveedores) el efecto sobre el saldo a favor de TM es Créditos − Débitos.

import { efectoMagrausa } from './calculos.js';

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);

function aFecha(v) {
  // read-excel-file entrega las fechas en UTC 00:00.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Magrausa a veces manda la fecha como número de serie de Excel (días desde 30/12/1899).
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

/** Filas del xlsx (array de arrays) → renglones con fecha, asiento, detalle, cuenta y efecto. */
export function leerEstadoCuenta(filas) {
  const enc = filas.findIndex((f) => f.some((c) => String(c ?? '').toLowerCase().startsWith('detalle')));
  if (enc < 0) throw new Error('No encontré la fila de encabezados (columna "Detalle de los movimientos").');
  const h = filas[enc].map((c) => String(c ?? '').toLowerCase());
  const col = (pref) => h.findIndex((c) => c.startsWith(pref));
  const iF = col('fecha'), iA = col('asiento'), iDet = col('detalle'), iDeb = col('débitos') >= 0 ? col('débitos') : col('debitos'),
    iCre = col('créditos') >= 0 ? col('créditos') : col('creditos'), iCta = 1;
  const renglones = [];
  for (const f of filas.slice(enc + 1)) {
    const fecha = aFecha(f[iF]);
    if (!fecha) continue;
    const debito = num(f[iDeb]), credito = num(f[iCre]);
    if (!debito && !credito) continue;
    renglones.push({
      fecha, asiento: String(f[iA] ?? '').trim(), detalle: String(f[iDet] ?? '').trim(),
      cuenta: String(f[iCta] ?? '').toUpperCase().includes('PROVEEDOR') ? 'proveedores' : 'deudores',
      debito, credito, efecto: r2(credito - debito),
    });
  }
  return renglones;
}

/**
 * Cruza los renglones de Magrausa con los movimientos cargados.
 * Primero por asiento + importe; después por fecha + importe. Los pares del mismo asiento
 * que se anulan entre sí (ej. un crédito que entra y sale) se marcan como "se cancelan".
 */
export function conciliar(renglones, movimientos) {
  const propios = movimientos.filter((m) => efectoMagrausa(m) !== 0).map((m) => ({ m, usado: false }));
  const res = renglones.map((r) => ({ ...r, estado: 'falta', movimiento: null }));

  const tomar = (r, pred) => {
    const p = propios.find((x) => !x.usado && Math.abs(efectoMagrausa(x.m) - r.efecto) < 0.005 && pred(x.m));
    if (p) { p.usado = true; r.estado = 'ok'; r.movimiento = p.m; }
  };
  for (const r of res) tomar(r, (m) => r.asiento && m.asiento_magrausa === r.asiento);
  for (const r of res.filter((x) => x.estado === 'falta')) tomar(r, (m) => m.fecha === r.fecha);

  const faltan = res.filter((x) => x.estado === 'falta');
  for (const r of faltan) {
    if (r.estado !== 'falta') continue;
    const par = faltan.find((o) => o !== r && o.estado === 'falta' && o.asiento === r.asiento && Math.abs(o.efecto + r.efecto) < 0.005);
    if (par) { r.estado = 'cancela'; par.estado = 'cancela'; }
  }

  const sobran = propios.filter((p) => !p.usado).map((p) => p.m);
  const saldoMagrausa = r2(renglones.reduce((s, r) => s + r.efecto, 0));
  const saldoPropio = r2(movimientos.reduce((s, m) => s + efectoMagrausa(m), 0));
  return { renglones: res, sobran, saldoMagrausa, saldoPropio, diferencia: r2(saldoPropio - saldoMagrausa) };
}

/** Movimiento a crear a partir de un renglón que falta. */
export function movimientoDesde(r) {
  const tipo = r.cuenta === 'deudores' && r.efecto > 0 ? 'giro' : r.cuenta === 'proveedores' && r.efecto < 0 ? 'pago' : 'ajuste';
  return {
    fecha: r.fecha, tipo, descripcion: r.detalle, asiento_magrausa: r.asiento,
    monto: tipo === 'ajuste' ? r.efecto : Math.abs(r.efecto),
    nota: 'Agregado desde el estado de cuenta de Magrausa',
  };
}
