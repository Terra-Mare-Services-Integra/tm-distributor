// Cálculos puros (sin Supabase) para presupuestos, cuenta con Magrausa y cashflow. Montos en USD.

export const ETAPAS = [
  ['compra', 'Compra'],
  ['acondicionamiento', 'Acondicionamiento'],
  ['importacion', 'Importación'],
  ['operacion', 'Operación'],
  ['otros', 'Otros'],
];

export const TIPOS_MOV = {
  giro: 'Giro a Magrausa',
  pago: 'Pago de Magrausa',
  pago_directo: 'Pago directo de TM',
  ajuste: 'Ajuste de saldo',
};

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const n = (x) => (x == null || x === '' ? 0 : Number(x));

/** Efecto de un movimiento sobre el saldo a favor de TM en Magrausa. */
export function efectoMagrausa(m) {
  if (m.tipo === 'giro') return n(m.monto);
  if (m.tipo === 'pago') return -n(m.monto);
  if (m.tipo === 'ajuste') return n(m.monto);
  return 0;
}

/** Movimientos ordenados por fecha con el saldo en Magrausa acumulado. */
export function conSaldo(movimientos) {
  let saldo = 0;
  return [...movimientos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'giro' ? -1 : 0) - (b.tipo === 'giro' ? -1 : 0) || a.created_at?.localeCompare(b.created_at ?? '') || 0)
    .map((m) => { saldo = r2(saldo + efectoMagrausa(m)); return { ...m, efecto: efectoMagrausa(m), saldo }; });
}

export function saldoMagrausa(movimientos) {
  return r2(movimientos.reduce((s, m) => s + efectoMagrausa(m), 0));
}

/** Suma de las líneas de detalle de un ítem (null si no tiene líneas con precio). */
export function totalLineas(lineas) {
  const conPrecio = lineas.filter((l) => l.precio != null);
  if (!conPrecio.length) return null;
  return r2(conPrecio.reduce((s, l) => s + n(l.cantidad ?? 1) * n(l.precio), 0));
}

/**
 * Cifras por ítem: cotizado, incluido (si incluir), facturado, pagado y pendiente.
 * Pendiente = lo que falta pagar del mayor entre lo cotizado-incluido y lo facturado.
 */
export function cifrasItem(item, facturas, movimientos) {
  const cotizado = item.monto_cotizado == null ? null : n(item.monto_cotizado);
  const incluido = item.incluir ? n(cotizado) : 0;
  const facturado = r2(facturas.filter((f) => f.item_id === item.id && f.moneda === 'USD').reduce((s, f) => s + n(f.total), 0));
  const pagado = r2(movimientos.filter((m) => m.item_id === item.id && (m.tipo === 'pago' || m.tipo === 'pago_directo')).reduce((s, m) => s + n(m.monto), 0));
  const esperado = item.incluir ? Math.max(incluido, facturado) : facturado;
  const pendiente = r2(Math.max(esperado - pagado, 0));
  const desvio = cotizado != null && facturado > 0 ? r2(facturado - cotizado) : null;
  return { cotizado, incluido, facturado, pagado, pendiente, desvio, esperado: r2(esperado) };
}

export function totales(filas) {
  const t = { cotizadoBase: 0, cotizadoOpcional: 0, incluido: 0, facturado: 0, pagado: 0, pendiente: 0, esperado: 0 };
  for (const { item, c } of filas) {
    if (item.tipo === 'opcional') t.cotizadoOpcional += n(c.cotizado); else t.cotizadoBase += n(c.cotizado);
    t.incluido += c.incluido; t.facturado += c.facturado; t.pagado += c.pagado; t.pendiente += c.pendiente; t.esperado += c.esperado;
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, r2(v)]));
}

/** Ítems con sus cifras, en el orden del presupuesto. */
export function filasItems(datos, filtro = () => true) {
  return datos.items.filter(filtro)
    .sort((a, b) => (a.hito ?? 99) - (b.hito ?? 99) || (a.n ?? 999) - (b.n ?? 999) || a.rubro.localeCompare(b.rubro))
    .map((item) => ({ item, c: cifrasItem(item, datos.facturas, datos.movimientos) }));
}

export const mesDe = (fecha) => (fecha ? fecha.slice(0, 7) : null);

/**
 * Cashflow mensual: real (giros, pagos vía Magrausa, pagos directos) y proyectado
 * (pendiente de cada ítem en el mes de su pago estimado, o "sin fecha").
 */
export function cashflow(datos, filasDeItems) {
  const meses = new Map();
  const fila = (mes) => {
    if (!meses.has(mes)) meses.set(mes, { mes, giros: 0, pagosMagrausa: 0, pagosDirectos: 0, ajustes: 0, proyectado: 0, items: [] });
    return meses.get(mes);
  };
  for (const m of datos.movimientos) {
    const f = fila(mesDe(m.fecha));
    if (m.tipo === 'giro') f.giros += n(m.monto);
    else if (m.tipo === 'pago') f.pagosMagrausa += n(m.monto);
    else if (m.tipo === 'pago_directo') f.pagosDirectos += n(m.monto);
    else f.ajustes += n(m.monto);
  }
  for (const { item, c } of filasDeItems) {
    if (c.pendiente <= 0) continue;
    const f = fila(mesDe(item.pago_estimado) ?? 'sin-fecha');
    f.proyectado += c.pendiente; f.items.push({ item, pendiente: c.pendiente });
  }
  const ordenadas = [...meses.values()].sort((a, b) => (a.mes === 'sin-fecha' ? 1 : b.mes === 'sin-fecha' ? -1 : a.mes.localeCompare(b.mes)));
  let saldo = 0;
  return ordenadas.map((f) => {
    saldo += f.giros - f.pagosMagrausa + f.ajustes;
    return { ...f, giros: r2(f.giros), pagosMagrausa: r2(f.pagosMagrausa), pagosDirectos: r2(f.pagosDirectos), ajustes: r2(f.ajustes), proyectado: r2(f.proyectado), saldo: r2(saldo) };
  });
}
