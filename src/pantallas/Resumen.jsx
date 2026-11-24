import { filasItems, totales, saldoMagrausa, ETAPAS } from '../lib/calculos.js';
import { usd } from '../lib/formato.js';

export default function Resumen({ ctx }) {
  const { datos } = ctx;
  const filas = filasItems(datos);
  const t = totales(filas);
  const saldo = saldoMagrausa(datos.movimientos);
  const giros = datos.movimientos.filter((m) => m.tipo === 'giro');
  const girado = giros.reduce((s, m) => s + Number(m.monto), 0);
  const gastosGiro = giros.reduce((s, m) => s + (m.enviado ? Number(m.enviado) - Number(m.monto) : 0), 0);
  const necesidad = Math.max(t.pendiente - saldo, 0);
  const desvios = filas.filter(({ c }) => c.desvio);
  const sinCotizar = filas.filter(({ item, c }) => item.incluir && c.cotizado == null && c.facturado === 0);

  const porEtapa = ETAPAS.map(([clave, nombre]) => {
    const f = filas.filter(({ item }) => item.etapa === clave);
    return { clave, nombre, n: f.length, t: totales(f) };
  }).filter((e) => e.n);

  const porHito = [...datos.hitos.map((h) => ({ n: h.n, nombre: `${h.n}. ${h.nombre}` })), { n: null, nombre: 'Sin hito' }]
    .map((h) => ({ ...h, t: totales(filas.filter(({ item }) => item.etapa === 'acondicionamiento' && (item.hito ?? null) === h.n)) }))
    .filter((h) => h.t.esperado || h.t.pagado || h.t.cotizadoOpcional);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>M/V DISTRIBUTOR.</h1>
          <div className="filete" />
        </div>
      </div>

      <div className="kpis">
        <Kpi titulo="Saldo en Magrausa" valor={saldo} nota={`Girado ${usd(girado)}${gastosGiro ? ` (+${usd(gastosGiro)} gastos de giro)` : ''}`} fuerte />
        <Kpi titulo="Pagado" valor={t.pagado} nota="Vía Magrausa y pagos directos" />
        <Kpi titulo="Pendiente de pago" valor={t.pendiente} nota="Ítems incluidos: lo cotizado o lo facturado, lo que sea mayor" />
        <Kpi titulo="Falta girar" valor={necesidad} nota="Pendiente − saldo en Magrausa" alerta={necesidad > 0} />
        <Kpi titulo="Presupuesto incluido" valor={t.incluido} nota={`Opcionales fuera: ${usd(t.cotizadoOpcional)}`} />
        <Kpi titulo="Facturado" valor={t.facturado} nota={`${datos.facturas.length} facturas`} />
      </div>

      {(desvios.length > 0 || sinCotizar.length > 0) && (
        <section>
          <h3>Para revisar</h3>
          <ul className="alertas">
            {desvios.map(({ item, c }) => (
              <li key={item.id}><a href={`#/item/${item.id}`}>{item.rubro}</a>: facturado {usd(c.facturado)} contra cotizado {usd(c.cotizado)} ({c.desvio > 0 ? '+' : ''}{usd(c.desvio)}).</li>
            ))}
            {sinCotizar.length > 0 && <li>{sinCotizar.length} ítems incluidos sin monto: {sinCotizar.map(({ item }, i) => (
              <span key={item.id}>{i ? ', ' : ''}<a href={`#/item/${item.id}`}>{item.rubro}</a></span>))}.</li>}
          </ul>
        </section>
      )}

      <section>
        <h3>Por etapa</h3>
        <TablaTotales filas={porEtapa.map((e) => ({ clave: e.clave, nombre: e.nombre, t: e.t }))} />
      </section>
      <section>
        <h3>Acondicionamiento por hito del contrato</h3>
        <TablaTotales filas={porHito.map((h) => ({ clave: String(h.n), nombre: h.nombre, t: h.t }))} />
      </section>
    </>
  );
}

function Kpi({ titulo, valor, nota, fuerte, alerta }) {
  return (
    <div className={`kpi${fuerte ? ' fuerte' : ''}${alerta ? ' alerta' : ''}`}>
      <div className="etiqueta">{titulo}</div>
      <div className="kpi-valor mono">USD {usd(valor)}</div>
      {nota && <div className="ayuda">{nota}</div>}
    </div>
  );
}

function TablaTotales({ filas }) {
  const total = filas.reduce((s, f) => Object.fromEntries(Object.keys(f.t).map((k) => [k, (s[k] ?? 0) + f.t[k]])), {});
  const Fila = ({ nombre, t, clase }) => (
    <tr className={clase}>
      <td>{nombre}</td>
      <td className="num">{usd(t.incluido)}</td><td className="num">{usd(t.cotizadoOpcional)}</td>
      <td className="num">{usd(t.facturado)}</td><td className="num">{usd(t.pagado)}</td><td className="num">{usd(t.pendiente)}</td>
    </tr>
  );
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead><tr><th></th><th className="num">Presup. incluido</th><th className="num">Opcional</th><th className="num">Facturado</th><th className="num">Pagado</th><th className="num">Pendiente</th></tr></thead>
        <tbody>
          {filas.map((f) => <Fila key={f.clave} nombre={f.nombre} t={f.t} />)}
          {filas.length > 1 && <Fila nombre="Total" t={total} clase="total" />}
        </tbody>
      </table>
    </div>
  );
}
