import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { usd2, fecha, aNumero, hoy } from '../lib/formato.js';
import { ListaArchivos, SubirArchivo, subirArchivos } from '../componentes/Archivos.jsx';

export const pagadoDeFactura = (datos, id) =>
  datos.movimientos.filter((m) => m.factura_id === id && (m.tipo === 'pago' || m.tipo === 'pago_directo')).reduce((s, m) => s + Number(m.monto), 0);

export function OpcionesItems({ datos }) {
  const items = [...datos.items].sort((a, b) => (a.n ?? 999) - (b.n ?? 999));
  return <>{items.map((i) => <option key={i.id} value={i.id}>{i.n != null ? `${i.n}. ` : ''}{i.rubro}</option>)}</>;
}

export default function Facturas({ ctx }) {
  const { datos, editor, recargar } = ctx;
  const [filtro, setFiltro] = useState('');
  const lista = datos.facturas.filter((f) => !filtro || `${f.proveedor} ${f.numero} ${f.concepto}`.toLowerCase().includes(filtro.toLowerCase()));
  const totalUsd = lista.filter((f) => f.moneda === 'USD').reduce((s, f) => s + Number(f.total), 0);

  async function vincular(id, item_id) {
    const { error } = await supabase.from('dist_facturas').update({ item_id: item_id || null }).eq('id', id);
    if (error) alert(error.message); else recargar('facturas');
  }

  return (
    <>
      <div className="encabezado">
        <div><h1>Facturas.</h1><div className="filete" /></div>
        <label>Buscar<input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Proveedor, número, concepto" /></label>
      </div>
      <p className="aviso">Facturas de talleres y proveedores. Las de Uruguay salen a nombre de Magrausa, que las paga con el saldo que gira Terra Mare.</p>

      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Número</th><th>Concepto</th><th>Ítem del presupuesto</th><th className="num">Total</th><th>Estado</th><th>Archivos</th></tr></thead>
          <tbody>
            {lista.map((f) => {
              const pagado = pagadoDeFactura(datos, f.id);
              const docs = datos.documentos.filter((d) => d.factura_id === f.id);
              return (
                <tr key={f.id}>
                  <td>{fecha(f.fecha)}</td>
                  <td>{f.proveedor}{f.emitida_a && <div className="ayuda">A nombre de {f.emitida_a}</div>}</td>
                  <td className="mono">{f.numero}</td>
                  <td className="concepto">{f.concepto}{f.trabajo_el && <div className="ayuda">Trabajo del {fecha(f.trabajo_el)}</div>}</td>
                  <td>{editor
                    ? <select value={f.item_id ?? ''} onChange={(e) => vincular(f.id, e.target.value)}><option value="">Sin ítem</option><OpcionesItems datos={datos} /></select>
                    : datos.items.find((i) => i.id === f.item_id)?.rubro ?? '—'}</td>
                  <td className="num">{f.moneda} {usd2(f.total)}</td>
                  <td>{pagado >= Number(f.total) - 0.005 ? <span className="chip ok">Pagada</span>
                    : pagado > 0 ? <span className="chip alerta">Pagado {usd2(pagado)}</span> : <span className="chip critico">Impaga</span>}</td>
                  <td><ListaArchivos ctx={ctx} docs={docs} vacio="" /><SubirArchivo ctx={ctx} vinculos={{ factura_id: f.id, item_id: f.item_id, tipo: 'factura', fecha: f.fecha }} texto="+ PDF" /></td>
                </tr>
              );
            })}
            {lista.length > 0 && <tr className="total"><td colSpan={5}>Total USD</td><td className="num">{usd2(totalUsd)}</td><td colSpan={2}></td></tr>}
          </tbody>
        </table>
      </div>
      {!lista.length && <div className="vacio">No hay facturas{filtro ? ' con ese filtro' : ''}.</div>}

      {editor && <NuevaFactura ctx={ctx} />}
    </>
  );
}

function NuevaFactura({ ctx }) {
  const vacio = { proveedor: '', numero: '', fecha: hoy(), moneda: 'USD', total: '', emitida_a: 'MAGRAUSA', item_id: '', trabajo_el: '', concepto: '' };
  const [f, setF] = useState(vacio);
  const [archivos, setArchivos] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const proveedores = [...new Set([...ctx.datos.facturas.map((x) => x.proveedor), ...ctx.datos.items.map((x) => x.proveedor)].filter(Boolean))].sort();
  if (!abierto) return <div className="fila-botones"><button className="secundario" onClick={() => setAbierto(true)}>+ Nueva factura</button></div>;

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    const { data, error } = await supabase.from('dist_facturas').insert({
      proveedor: f.proveedor.trim(), numero: f.numero.trim(), fecha: f.fecha, moneda: f.moneda, total: aNumero(f.total),
      emitida_a: f.emitida_a.trim(), item_id: f.item_id || null, trabajo_el: f.trabajo_el || null, concepto: f.concepto.trim(),
    }).select('id').single();
    if (error) { setGuardando(false); alert(error.message); return; }
    try { if (archivos.length) await subirArchivos(archivos, { factura_id: data.id, item_id: f.item_id || null, tipo: 'factura', fecha: f.fecha }); }
    catch (err) { alert(err.message); }
    setGuardando(false); setF(vacio); setArchivos([]); setAbierto(false);
    ctx.recargar('facturas', 'documentos');
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <h3>Nueva factura</h3>
      <div className="rejilla">
        <label>Proveedor<input required list="proveedores" value={f.proveedor} onChange={set('proveedor')} />
          <datalist id="proveedores">{proveedores.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label>Número<input value={f.numero} onChange={set('numero')} placeholder="A 0001234" /></label>
        <label>Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} /></label>
        <label>Moneda<select value={f.moneda} onChange={set('moneda')}>{['USD', 'UYU', 'ARS', 'EUR'].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Total<input required inputMode="decimal" value={f.total} onChange={set('total')} /></label>
        <label>A nombre de<input value={f.emitida_a} onChange={set('emitida_a')} /></label>
        <label>Ítem del presupuesto<select value={f.item_id} onChange={set('item_id')}><option value="">Sin ítem</option><OpcionesItems datos={ctx.datos} /></select></label>
        <label>Fecha del trabajo<input type="date" value={f.trabajo_el} onChange={set('trabajo_el')} /></label>
      </div>
      <label className="ancho">Concepto<input value={f.concepto} onChange={set('concepto')} /></label>
      <label className="ancho">PDF de la factura<input type="file" multiple onChange={(e) => setArchivos([...e.target.files])} /></label>
      <div className="fila-botones"><button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar factura'}</button>
        <button type="button" className="terciario" onClick={() => { setF(vacio); setAbierto(false); }}>Cancelar</button></div>
    </form>
  );
}
