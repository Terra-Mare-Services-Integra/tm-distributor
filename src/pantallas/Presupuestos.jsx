import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { filasItems, totales, ETAPAS, ESTADOS_PAGO, PAISES_PAGO } from '../lib/calculos.js';
import { usd, aNumero } from '../lib/formato.js';
import { SelectorHito, NuevoHito } from '../componentes/Hitos.jsx';
import { abrirArchivo } from '../componentes/Archivos.jsx';

export default function Presupuestos({ ctx }) {
  const { datos, editor } = ctx;
  const [etapa, setEtapa] = useState(() => sessionStorage.getItem('dist-etapa') ?? 'acondicionamiento');
  const [verOpcionales, setVerOpcionales] = useState(true);
  const elegir = (e) => { setEtapa(e); try { sessionStorage.setItem('dist-etapa', e); } catch { /* sin storage */ } };

  const filas = filasItems(datos, (i) => i.etapa === etapa && (verOpcionales || i.tipo === 'base'));
  const grupos = etapa === 'acondicionamiento'
    ? [...datos.hitos.map((h) => ({ clave: h.n, titulo: `Hito ${h.n} · ${h.nombre}`, sub: h.tareas ? `Tareas ${h.tareas} del Anexo I` : null })), { clave: null, titulo: 'Sin hito' }]
    : [{ clave: 'todos', titulo: null }];
  const del = (g) => filas.filter(({ item }) => g.clave === 'todos' || (item.hito ?? null) === g.clave);

  return (
    <>
      <div className="encabezado">
        <div><h1>Presupuestos.</h1><div className="filete" /></div>
        <label className="casilla"><input type="checkbox" checked={verOpcionales} onChange={(e) => setVerOpcionales(e.target.checked)} /> Mostrar opcionales</label>
      </div>
      <div className="pestanas">
        {ETAPAS.map(([k, n]) => {
          const cant = datos.items.filter((i) => i.etapa === k).length;
          return <button key={k} className={etapa === k ? 'activa' : ''} onClick={() => elegir(k)}>{n}{cant ? ` (${cant})` : ''}</button>;
        })}
      </div>

      {!filas.length && <div className="vacio">Todavía no hay ítems en esta etapa.</div>}

      {grupos.map((g) => {
        const f = del(g);
        if (!f.length) return null;
        const t = totales(f);
        return (
          <section key={String(g.clave)}>
            {g.titulo && <h3>{g.titulo} {g.sub && <span className="ayuda">· {g.sub}</span>}</h3>}
            <div className="tabla-scroll">
              <table className="tabla presupuesto">
                <colgroup>
                  <col className="c-n" /><col /><col className="c-monto" /><col className="c-monto" /><col className="c-monto" /><col className="c-monto" />
                  <col className="c-estado" /><col className="c-pais" /><col className="c-docs" />
                </colgroup>
                <thead><tr>
                  <th className="num">N°</th><th>Rubro · proveedor</th>
                  <th className="num">Cotizado</th><th className="num">Facturado</th><th className="num">Pagado</th><th className="num">Pendiente</th>
                  <th>Estado</th><th>Pagado en</th><th>Factura</th>
                </tr></thead>
                <tbody>
                  {f.map(({ item, c }) => (
                    <tr key={item.id} className={`fila-link${item.incluir ? '' : ' apagada'}`} onClick={(e) => { if (!e.target.closest('button, a')) window.location.hash = `#/item/${item.id}`; }}>
                      <td className="num">{item.n ?? ''}</td>
                      <td>
                        <a href={`#/item/${item.id}`}>{item.rubro}</a>
                        {item.tipo === 'opcional' && <span className="etiqueta-op">Opcional</span>}
                        {!item.incluir && item.tipo === 'base' && <span className="etiqueta-op">Fuera del total</span>}
                        <div className="ayuda una-linea" title={item.observaciones || undefined}>{[item.proveedor, item.observaciones].filter(Boolean).join(' · ') || '\u00a0'}</div>
                      </td>
                      <td className="num">{usd(c.cotizado)}</td>
                      <td className={`num${c.desvio > 0 ? ' rojo' : ''}`} title={c.desvio ? `Desvío ${usd(c.desvio)}` : ''}>{c.facturado ? usd(c.facturado) : '—'}</td>
                      <td className="num">{c.pagado ? usd(c.pagado) : '—'}</td>
                      <td className="num fuerte">{c.pendiente ? usd(c.pendiente) : '—'}</td>
                      <td>{c.estado ? <span className={`chip ${ESTADOS_PAGO[c.estado]?.[1] ?? ''}`}>{ESTADOS_PAGO[c.estado]?.[0]}</span> : ''}</td>
                      <td>{c.pais ? PAISES_PAGO[c.pais] : ''}</td>
                      <td><Adjuntos ctx={ctx} item={item} c={c} /></td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td></td><td>Subtotal</td>
                    <td className="num">{usd(t.incluido)}</td><td className="num">{usd(t.facturado)}</td><td className="num">{usd(t.pagado)}</td><td className="num">{usd(t.pendiente)}</td><td></td><td></td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {editor && <NuevoItem ctx={ctx} etapa={etapa} />}
      {editor && etapa === 'acondicionamiento' && <div className="fila-botones"><NuevoHito ctx={ctx} /></div>}
    </>
  );
}

/** Factura del ítem (abre el PDF); el resto de los archivos se ven en el ítem. Avisa si hay pagos sin factura. */
function Adjuntos({ ctx, item, c }) {
  const { datos } = ctx;
  const facs = datos.facturas.filter((f) => f.item_id === item.id);
  const pagos = datos.movimientos.filter((m) => m.item_id === item.id);
  const docs = datos.documentos.filter((d) => d.item_id === item.id || facs.some((f) => f.id === d.factura_id) || pagos.some((p) => p.id === d.movimiento_id));
  const facturas = docs.filter((d) => d.tipo === 'factura');
  const otros = docs.length - facturas.length;
  const falta = !facturas.length && (pagos.length > 0 || facs.length > 0 || c.estado === 'pagado');
  const parcial = falta && c.estado === 'parcial';
  return (
    <div className="adjuntos">
      {facturas.map((d) => <button key={d.id} className="clip" title={d.nombre} onClick={() => abrirArchivo(d.ruta)}>📄</button>)}
      {falta && <span className={parcial ? 'falta parcial' : 'falta'} title={parcial ? 'Pago parcial: la factura puede llegar al cierre' : 'Hay pagos cargados y no está la factura'}>{parcial ? 'Al cierre' : 'Falta'}</span>}
      {otros > 0 && <a className="otros" href={`#/item/${item.id}`} title="Comprobantes, presupuestos y certificados">+{otros}</a>}
    </div>
  );
}

function NuevoItem({ ctx, etapa }) {
  const vacio = { rubro: '', proveedor: '', hito: '', tipo: 'base', monto: '', cotizado_el: '' };
  const [f, setF] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!abierto) return <div className="fila-botones"><button className="secundario" onClick={() => setAbierto(true)}>+ Nuevo ítem</button></div>;
  async function guardar(e) {
    e.preventDefault();
    const maxN = Math.max(0, ...ctx.datos.items.map((i) => i.n ?? 0));
    const { data, error } = await supabase.from('dist_items').insert({
      n: maxN + 1, etapa, rubro: f.rubro.trim(), proveedor: f.proveedor.trim(), hito: f.hito ? Number(f.hito) : null,
      tipo: f.tipo, incluir: f.tipo === 'base', monto_cotizado: aNumero(f.monto), cotizado_el: f.cotizado_el || null,
    }).select('id').single();
    if (error) { alert(error.message); return; }
    await ctx.recargar('items');
    window.location.hash = `#/item/${data.id}`;
  }
  return (
    <form className="formulario" onSubmit={guardar}>
      <h3>Nuevo ítem</h3>
      <div className="rejilla">
        <label>Rubro<input required value={f.rubro} onChange={set('rubro')} /></label>
        <label>Proveedor<input value={f.proveedor} onChange={set('proveedor')} /></label>
        {etapa === 'acondicionamiento' && <label>Hito<SelectorHito ctx={ctx} value={f.hito} onChange={(v) => setF((x) => ({ ...x, hito: v }))} /></label>}
        <label>Tipo<select value={f.tipo} onChange={set('tipo')}><option value="base">Base</option><option value="opcional">Opcional</option></select></label>
        <label>Monto cotizado (USD)<input inputMode="decimal" value={f.monto} onChange={set('monto')} /></label>
        <label>Fecha de cotización<input type="date" value={f.cotizado_el} onChange={set('cotizado_el')} /></label>
      </div>
      <div className="fila-botones"><button>Crear</button><button type="button" className="terciario" onClick={() => { setF(vacio); setAbierto(false); }}>Cancelar</button></div>
    </form>
  );
}
