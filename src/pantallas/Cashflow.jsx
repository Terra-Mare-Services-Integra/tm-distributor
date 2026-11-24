import { cashflow, filasItems, saldoMagrausa } from '../lib/calculos.js';
import { usd, mes } from '../lib/formato.js';

export default function Cashflow({ ctx }) {
  const { datos } = ctx;
  const filas = cashflow(datos, filasItems(datos));
  const saldo = saldoMagrausa(datos.movimientos);
  let acumulado = saldo;
  const proyeccion = filas.filter((f) => f.proyectado > 0).map((f) => {
    acumulado -= f.proyectado;
    return { ...f, saldoProyectado: acumulado };
  });

  return (
    <>
      <div className="encabezado"><div><h1>Cashflow.</h1><div className="filete" /></div></div>

      <section>
        <h3>Real por mes</h3>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Mes</th><th className="num">Giros a Magrausa</th><th className="num">Pagos de Magrausa</th><th className="num">Ajustes</th><th className="num">Saldo en Magrausa</th><th className="num">Pagos directos TM</th></tr></thead>
            <tbody>
              {filas.filter((f) => f.mes !== 'sin-fecha' && (f.giros || f.pagosMagrausa || f.pagosDirectos || f.ajustes)).map((f) => (
                <tr key={f.mes}><td>{mes(f.mes)}</td><td className="num">{usd(f.giros)}</td><td className="num">{usd(f.pagosMagrausa)}</td>
                  <td className="num">{f.ajustes ? usd(f.ajustes) : ''}</td><td className="num fuerte">{usd(f.saldo)}</td><td className="num">{f.pagosDirectos ? usd(f.pagosDirectos) : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Proyectado: lo que falta pagar</h3>
        <p className="aviso">Pendiente de cada ítem incluido, en el mes de su “pago estimado” (se carga en Presupuestos). El saldo proyectado parte del saldo actual en Magrausa (USD {usd(saldo)}); si da negativo, es lo que falta girar.</p>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Mes</th><th>Ítems</th><th className="num">A pagar</th><th className="num">Saldo proyectado</th></tr></thead>
            <tbody>
              {proyeccion.map((f) => (
                <tr key={f.mes}>
                  <td>{mes(f.mes)}</td>
                  <td>{f.items.map(({ item, pendiente }, i) => <span key={item.id}>{i ? ' · ' : ''}<a href={`#/item/${item.id}`}>{item.rubro}</a> <span className="ayuda">{usd(pendiente)}</span></span>)}</td>
                  <td className="num">{usd(f.proyectado)}</td>
                  <td className={`num fuerte${f.saldoProyectado < 0 ? ' rojo' : ''}`}>{usd(f.saldoProyectado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!proyeccion.length && <div className="vacio">No hay pagos pendientes.</div>}
      </section>
    </>
  );
}
