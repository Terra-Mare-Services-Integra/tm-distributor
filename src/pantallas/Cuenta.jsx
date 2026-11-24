import { useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { supabase } from '../lib/supabase.js';
import { conSaldo, saldoMagrausa, TIPOS_MOV } from '../lib/calculos.js';
import { leerEstadoCuenta, conciliar, movimientoDesde } from '../lib/conciliacion.js';
import { usd, usd2, fecha, aNumero, hoy } from '../lib/formato.js';
import { ListaArchivos, SubirArchivo, subirArchivos } from '../componentes/Archivos.jsx';
import { OpcionesItems, pagadoDeFactura } from './Facturas.jsx';

export default function Cuenta({ ctx }) {
  const { datos, editor } = ctx;
  const movs = conSaldo(datos.movimientos);
  const saldo = saldoMagrausa(datos.movimientos);
  const [editando, setEditando] = useState(null);

  return (
    <>
      <div className="encabezado">
        <div><h1>Cuenta con Magrausa.</h1><div className="filete" /></div>
        <div className="kpi fuerte"><div className="etiqueta">Saldo a favor de Terra Mare</div><div className="kpi-valor mono">USD {usd(saldo)}</div></div>
      </div>
      <p className="aviso">Giros de Terra Mare a Magrausa y pagos que Magrausa hace por cuenta de Terra Mare. Los pagos directos (desde Argentina u otra cuenta) se muestran pero no mueven el saldo.</p>

      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Asiento</th><th className="num">Entra</th><th className="num">Sale</th><th className="num">Saldo</th><th>Archivos</th>{editor && <th></th>}</tr></thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id} className={m.tipo === 'pago_directo' ? 'apagada' : ''}>
                <td>{fecha(m.fecha)}</td>
                <td><span className={`chip tipo-${m.tipo}`}>{TIPOS_MOV[m.tipo]}</span></td>
                <td>{m.descripcion}
                  {m.tipo === 'giro' && (m.ordenante || m.enviado) && <div className="ayuda">{m.ordenante && `Ordena ${m.ordenante}`}{m.enviado && Number(m.enviado) !== Number(m.monto) ? ` · Enviado ${usd2(m.enviado)}, gastos ${usd2(m.enviado - m.monto)}` : ''}</div>}
                  {m.item_id && <div className="ayuda"><a href={`#/item/${m.item_id}`}>{datos.items.find((i) => i.id === m.item_id)?.rubro}</a></div>}
                  {m.nota && <div className="ayuda">{m.nota}</div>}
                </td>
                <td className="mono">{m.asiento_magrausa}</td>
                <td className="num">{m.efecto > 0 ? usd2(m.efecto) : ''}</td>
                <td className="num">{m.efecto < 0 ? usd2(-m.efecto) : m.tipo === 'pago_directo' ? <span className="ayuda">({usd2(m.monto)})</span> : ''}</td>
                <td className="num">{usd2(m.saldo)}</td>
                <td><ListaArchivos ctx={ctx} docs={datos.documentos.filter((d) => d.movimiento_id === m.id)} vacio="" />
                  <SubirArchivo ctx={ctx} vinculos={{ movimiento_id: m.id, item_id: m.item_id, tipo: 'comprobante', fecha: m.fecha }} texto="+ Comprobante" /></td>
                {editor && <td><button className="terciario chico" onClick={() => setEditando(m)}>Editar</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!movs.length && <div className="vacio">Sin movimientos.</div>}

      {editor && <Movimiento key={editando?.id ?? 'nuevo'} ctx={ctx} mov={editando} cerrar={() => setEditando(null)} />}
      <Conciliacion ctx={ctx} />
      <section>
        <h3>Estados de cuenta recibidos</h3>
        <ListaArchivos ctx={ctx} docs={datos.documentos.filter((d) => d.tipo === 'estado_cuenta')} vacio="Ninguno todavía." />
        <div className="fila-botones"><SubirArchivo ctx={ctx} vinculos={{ tipo: 'estado_cuenta', fecha: hoy() }} texto="Guardar estado de cuenta" /></div>
      </section>
    </>
  );
}

function Movimiento({ ctx, mov, cerrar }) {
  const { datos, recargar } = ctx;
  const inicial = mov
    ? { ...mov, monto: String(mov.monto).replace('.', ','), enviado: mov.enviado == null ? '' : String(mov.enviado).replace('.', ','), item_id: mov.item_id ?? '', factura_id: mov.factura_id ?? '' }
    : { fecha: hoy(), tipo: 'pago', descripcion: '', monto: '', enviado: '', ordenante: '', item_id: '', factura_id: '', asiento_magrausa: '', nota: '' };
  const [f, setF] = useState(inicial);
  const [archivos, setArchivos] = useState([]);
  const [abierto, setAbierto] = useState(!!mov);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!abierto) return <div className="fila-botones"><button className="secundario" onClick={() => setAbierto(true)}>+ Nuevo movimiento</button></div>;

  const facturasAbiertas = datos.facturas.filter((x) => x.id === f.factura_id || pagadoDeFactura(datos, x.id) < Number(x.total) - 0.005);
  function elegirFactura(e) {
    const fac = datos.facturas.find((x) => x.id === e.target.value);
    if (!fac) { setF({ ...f, factura_id: '' }); return; }
    const resto = Number(fac.total) - pagadoDeFactura(datos, fac.id) + (mov?.factura_id === fac.id ? Number(mov.monto) : 0);
    setF({ ...f, factura_id: fac.id, item_id: fac.item_id ?? f.item_id, monto: f.monto || String(resto).replace('.', ','),
      descripcion: f.descripcion || `${fac.proveedor} factura ${fac.numero}` });
  }

  async function guardar(e) {
    e.preventDefault();
    const fila = {
      fecha: f.fecha, tipo: f.tipo, descripcion: f.descripcion.trim(), monto: aNumero(f.monto),
      enviado: f.tipo === 'giro' ? aNumero(f.enviado) : null, ordenante: f.tipo === 'giro' ? f.ordenante.trim() : '',
      item_id: f.item_id || null, factura_id: f.factura_id || null, asiento_magrausa: f.asiento_magrausa.trim(), nota: f.nota.trim(),
    };
    const r = mov ? await supabase.from('dist_movimientos').update(fila).eq('id', mov.id).select('id').single()
      : await supabase.from('dist_movimientos').insert(fila).select('id').single();
    if (r.error) { alert(r.error.message); return; }
    try { if (archivos.length) await subirArchivos(archivos, { movimiento_id: r.data.id, item_id: fila.item_id, tipo: 'comprobante', fecha: fila.fecha }); }
    catch (err) { alert(err.message); }
    await recargar('movimientos', 'documentos');
    setAbierto(false); cerrar();
  }

  async function borrar() {
    if (!confirm('¿Borrar este movimiento? No se puede deshacer.')) return;
    const { error } = await supabase.from('dist_movimientos').delete().eq('id', mov.id);
    if (error) { alert(error.message); return; }
    await recargar('movimientos'); cerrar();
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <h3>{mov ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
      <div className="rejilla">
        <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_MOV).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} /></label>
        {(f.tipo === 'pago' || f.tipo === 'pago_directo') && <label>Factura<select value={f.factura_id} onChange={elegirFactura}><option value="">Sin factura</option>
          {facturasAbiertas.map((x) => <option key={x.id} value={x.id}>{x.proveedor} {x.numero} · {x.moneda} {usd2(x.total)}</option>)}</select></label>}
        <label>{f.tipo === 'giro' ? 'Monto acreditado por Magrausa' : f.tipo === 'ajuste' ? 'Monto (+ suma / − resta al saldo)' : 'Monto'} (USD)
          <input required inputMode="decimal" value={f.monto} onChange={set('monto')} /></label>
        {f.tipo === 'giro' && <>
          <label>Monto enviado (USD)<input inputMode="decimal" value={f.enviado} onChange={set('enviado')} /></label>
          <label>Ordenante<input value={f.ordenante} onChange={set('ordenante')} placeholder="BG, PL…" /></label>
        </>}
        {(f.tipo === 'pago' || f.tipo === 'pago_directo') && <label>Ítem del presupuesto<select value={f.item_id} onChange={set('item_id')}><option value="">Sin ítem</option><OpcionesItems datos={datos} /></select></label>}
        <label>Asiento Magrausa<input value={f.asiento_magrausa} onChange={set('asiento_magrausa')} /></label>
      </div>
      <label className="ancho">Descripción<input value={f.descripcion} onChange={set('descripcion')} /></label>
      <label className="ancho">Nota<input value={f.nota} onChange={set('nota')} /></label>
      <label className="ancho">Comprobante<input type="file" multiple onChange={(e) => setArchivos([...e.target.files])} /></label>
      <div className="fila-botones">
        <button>Guardar</button>
        <button type="button" className="terciario" onClick={() => { setAbierto(false); cerrar(); }}>Cancelar</button>
        {mov && <button type="button" className="terciario peligro" onClick={borrar}>Borrar</button>}
      </div>
    </form>
  );
}

function Conciliacion({ ctx }) {
  const { datos, editor, recargar } = ctx;
  const [res, setRes] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState(null);

  async function leer(file) {
    setError(null); setRes(null); setArchivo(file);
    try {
      const filas = await readXlsxFile(file);
      const renglones = leerEstadoCuenta(filas);
      if (!renglones.length) throw new Error('El archivo no tiene movimientos con fecha.');
      setRes(conciliar(renglones, datos.movimientos));
    } catch (e) { setError(e.message); }
  }
  // Se recalcula con los datos actuales cuando se agregan movimientos.
  const actual = res ? conciliar(res.renglones, datos.movimientos) : null;

  async function agregar(r) {
    const { error: e } = await supabase.from('dist_movimientos').insert(movimientoDesde(r));
    if (e) alert(e.message); else recargar('movimientos');
  }

  return (
    <section className="bloque">
      <h3>Conciliar con el estado de cuenta de Magrausa</h3>
      <p className="aviso">Subí el Excel que manda Magrausa (“Emisión de Estados de Cuenta”). Se compara renglón por renglón con lo cargado acá, por asiento e importe.</p>
      <div className="fila-botones">
        <label className="subir"><span className="boton-chico">Elegir Excel de Magrausa</span>
          <input type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) leer(f); }} /></label>
        {archivo && <span className="ayuda">{archivo.name}</span>}
        {archivo && actual && editor && <button className="secundario chico" onClick={async () => {
          try { await subirArchivos([archivo], { tipo: 'estado_cuenta', fecha: hoy() }); recargar('documentos'); alert('Guardado en Documentos.'); }
          catch (e) { alert(e.message); }
        }}>Guardar este Excel en Documentos</button>}
      </div>
      {error && <p className="aviso error">{error}</p>}
      {actual && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="etiqueta">Saldo según Magrausa</div><div className="kpi-valor mono">{usd2(actual.saldoMagrausa)}</div></div>
            <div className="kpi"><div className="etiqueta">Saldo según TM Distributor</div><div className="kpi-valor mono">{usd2(actual.saldoPropio)}</div></div>
            <div className={`kpi${Math.abs(actual.diferencia) > 0.005 ? ' alerta' : ''}`}><div className="etiqueta">Diferencia</div><div className="kpi-valor mono">{usd2(actual.diferencia)}</div>
              {Math.abs(actual.diferencia) <= 0.005 && <div className="ayuda">Conciliado</div>}</div>
          </div>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Cuenta</th><th>Asiento</th><th>Detalle</th><th className="num">Efecto</th><th>Estado</th></tr></thead>
              <tbody>
                {actual.renglones.map((r, i) => (
                  <tr key={i}>
                    <td>{fecha(r.fecha)}</td><td>{r.cuenta === 'deudores' ? 'Deudores' : 'Proveedores'}</td><td className="mono">{r.asiento}</td><td>{r.detalle}</td>
                    <td className="num">{usd2(r.efecto)}</td>
                    <td>{r.estado === 'ok' ? <span className="chip ok">Coincide</span>
                      : r.estado === 'cancela' ? <span className="chip" title="Entra y sale con el mismo asiento: no cambia el saldo">Se cancela</span>
                      : <>{<span className="chip critico">Falta cargar</span>} {editor && <button className="secundario chico" onClick={() => agregar(r)}>Agregar</button>}</>}</td>
                  </tr>
                ))}
                {actual.sobran.map((m) => (
                  <tr key={m.id}><td>{fecha(m.fecha)}</td><td colSpan={2}>Solo en TM Distributor</td><td>{m.descripcion}</td><td className="num">{usd2(m.tipo === 'pago' ? -m.monto : m.monto)}</td><td><span className="chip alerta">No está en Magrausa</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
