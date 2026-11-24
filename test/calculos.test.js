// Números inventados: no coinciden con valores reales del proyecto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cifrasItem, conSaldo, saldoMagrausa, totalLineas, cashflow, filasItems } from '../src/lib/calculos.js';
import { leerEstadoCuenta, conciliar, movimientoDesde } from '../src/lib/conciliacion.js';
import { aNumero } from '../src/lib/formato.js';

const movs = [
  { id: 'g1', fecha: '2030-01-05', tipo: 'giro', monto: 1000 },
  { id: 'p1', fecha: '2030-01-10', tipo: 'pago', monto: 300, item_id: 'a', asiento_magrausa: '77' },
  { id: 'd1', fecha: '2030-01-12', tipo: 'pago_directo', monto: 50, item_id: 'b' },
  { id: 'a1', fecha: '2030-02-01', tipo: 'ajuste', monto: -10 },
];

test('saldo en Magrausa: giros − pagos + ajustes; los pagos directos no cuentan', () => {
  assert.equal(saldoMagrausa(movs), 690);
  assert.deepEqual(conSaldo(movs).map((m) => m.saldo), [1000, 700, 700, 690]);
});

test('cifras de un ítem incluido con factura mayor a lo cotizado', () => {
  const item = { id: 'a', incluir: true, monto_cotizado: 250 };
  const c = cifrasItem(item, [{ item_id: 'a', moneda: 'USD', total: 320 }], movs);
  assert.deepEqual([c.incluido, c.facturado, c.pagado, c.pendiente, c.desvio], [250, 320, 300, 20, 70]);
});

test('ítem no incluido: solo queda pendiente lo facturado', () => {
  const c = cifrasItem({ id: 'z', incluir: false, monto_cotizado: 999 }, [], []);
  assert.deepEqual([c.incluido, c.pendiente], [0, 0]);
});

test('total de líneas', () => {
  assert.equal(totalLineas([{ cantidad: 3, precio: 1.5 }, { cantidad: null, precio: 10 }, { cantidad: 2, precio: null }]), 14.5);
  assert.equal(totalLineas([{ cantidad: 1, precio: null }]), null);
});

test('cashflow: real por mes y proyectado sin fecha al final', () => {
  const datos = { items: [{ id: 'a', incluir: true, monto_cotizado: 400, hito: 1, n: 1, rubro: 'x' }], facturas: [], movimientos: movs };
  const cf = cashflow(datos, filasItems(datos));
  assert.deepEqual(cf.map((f) => f.mes), ['2030-01', '2030-02', 'sin-fecha']);
  assert.equal(cf[0].saldo, 700);
  assert.equal(cf[2].proyectado, 100);
});

test('conciliación con estado de cuenta', () => {
  const filas = [
    ['RUBRO', 'NOMBRE', 'CODIGO', 'NOMBRE', 'Fecha', 'Asiento', 'Documento', 'Detalle de los movimientos', 'Débitos U$S', 'Créditos U$S', 'Saldo U$S'],
    ['1', 'DEUDORES', 'X', 'X', '', '', '', 'Saldo anterior', '', '', 0],
    ['1', 'DEUDORES', 'X', 'X', new Date(2030, 0, 3), 5, '', 'cred', 40, '', 40],
    ['1', 'DEUDORES', 'X', 'X', new Date(2030, 0, 5), 6, '', 'deposito', '', 1000, -960],
    ['2', 'PROVEEDORES', 'X', 'X', new Date(2030, 0, 3), 5, '', 'cred', '', 40, 40],
    ['2', 'PROVEEDORES', 'X', 'X', new Date(2030, 0, 10), 77, '', 'pago', 300, '', -260],
    ['2', 'PROVEEDORES', 'X', 'X', new Date(2030, 0, 20), 78, '', 'pago nuevo', 25, '', -285],
  ];
  const r = leerEstadoCuenta(filas);
  assert.equal(r.length, 5);
  const c = conciliar(r, movs);
  assert.deepEqual(c.renglones.map((x) => x.estado), ['cancela', 'ok', 'cancela', 'ok', 'falta']);
  assert.equal(c.saldoMagrausa, 675);
  assert.equal(c.diferencia, 15);
  assert.deepEqual(c.sobran.map((m) => m.id), ['a1']);
  assert.equal(movimientoDesde(c.renglones[4]).tipo, 'pago');
});

test('números con formato argentino', () => {
  assert.equal(aNumero('1.234,5'), 1234.5);
  assert.equal(aNumero('12.5'), 12.5);
  assert.equal(aNumero(''), null);
});
