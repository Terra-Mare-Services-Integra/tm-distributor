import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { filasItems, totales, ETAPAS, ESTADOS_PAGO, PAISES_PAGO } from '../lib/calculos.js';
import { usd, aNumero } from '../lib/formato.js';
import { SelectorHito, NuevoHito } from '../componentes/Hitos.jsx';
import { abrirArchivo, SubirArchivo } from '../componentes/Archivos.jsx';

export default function Presupuestos({ ctx }) {
  const { datos, editor, recargar } = ctx;
  const [etapa, setEtapa] = useState(() => sessionStorage.getItem('dist-etapa') ?? 'acondicionamiento');
  const [verOpcionales, setVerOpcionales] = useState(true);
  const elegir = (e) => { setEtapa(e); try { sessionStorage.setItem('dist-etapa', e); } catch { /* sin storage */ } };

  const filas = filasItems(datos, (i) => i.etapa === etapa && (verOpcionales || i.tipo === 'base'));
  const grupos = etapa === 'acondicionamiento'
    ? [...datos.hitos.map((h) => ({ clave: h.n, titulo: `Hito ${h.n} · ${h.nombre}`, sub: h.tareas ? `Tareas ${h.tareas} del Anexo I` : null })), { clave: null, titulo: 'Sin hito' }]
    : [{ clave: 'todos', titulo: null }];
  const del = (g) => filas.filter(({ item }) => g.clave === 'todos' || (item.hito ?? null) === g.clave);

  async function cambiar(id, campos) {
    const { error } = await supabase.from('dist_items').update(campos).eq('id', id);
    if (error) alert(error.message); else recargar('items');
  }

  async function borrar(item) {
    const asociados = datos.facturas.some((f) => f.item_id === item.id) || datos.movimientos.some((m) => m.item_id === item.id);
    if (asociados) { alert(`"${item.rubro}" tiene facturas o pagos asociados: primero desvinculalos.`); return; }
    if (!confirm(`¿Borrar "${item.rubro}" y su detalle? No se puede deshacer.`)) return;
    const { error } = await supabase.from('dist_items').delete().eq('id', item.id);
    if (error) alert(error.message); else recargar('items', 'lineas');
  }

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
        if (!f.length && !(editor && typeof g.clave === 'number')) return null;
        if (!f.length) return (
          <section key={String(g.clave)}>
            <h3>{g.titulo} {g.sub && <span className="ayuda">· {g.sub}</span>}</h3>
            <p className="aviso">Sin ítems todavía. Asignale ítems desde “Editar” o creá uno nuevo.</p>
          </section>
        );
        const t = totales(f);
        return (
          <section key={String(g.clave)}>
            {g.titulo && <h3>{g.titulo} {g.sub && <span className="ayuda">· {g.sub}</span>}</h3>}
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr>
                  <th>N°</th><th>Rubro</th><th>Proveedor</th><th>Tipo</th><th title="Entra en el total">Incluir</th>
                  <th className="num">Cotizado</th><th className="num">Facturado</th><th className="num">Pagado</th><th className="num">Pendiente</th><th title="Facturas y comprobantes adjuntos">Adjuntos</th><th>Estado</th><th>Pagado en</th><th>Pago estimado</th>{editor && <th></th>}
                </tr></thead>
                <tbody>
                  {f.map(({ item, c }) => (
                    <tr key={item.id} className={item.incluir ? '' : 'apagada'}>
                      <td className="mono">{item.n ?? ''}</td>
                      <td><a href={`#/item/${item.id}`}>{item.rubro}</a>{item.observaciones && <div className="ayuda una-linea" title={item.observaciones}>{item.observaciones}</div>}</td>
                      <td>{item.proveedor || <span className="ayuda">—</span>}</td>
                      <td>{editor
                        ? <select value={item.tipo} onChange={(e) => cambiar(item.id, { tipo: e.target.value, incluir: e.target.value === 'base' ? item.incluir : false })}>
                            <option value="base">Base</option><option value="opcional">Opcional</option></select>
                        : item.tipo === 'base' ? 'Base' : 'Opcional'}</td>
                      <td className="centro"><input type="checkbox" checked={item.incluir} disabled={!editor} onChange={(e) => cambiar(item.id, { incluir: e.target.checked })} /></td>
                      <td className="num">{usd(c.cotizado)}</td>
                      <td className={`num${c.desvio > 0 ? ' rojo' : ''}`} title={c.desvio ? `Desvío ${usd(c.desvio)}` : ''}>{c.facturado ? usd(c.facturado) : ''}</td>
                      <td className="num">{c.pagado ? usd(c.pagado) : ''}</td>
                      <td className="num">{c.pendiente ? usd(c.pendiente) : ''}</td>
                      <td><Adjuntos ctx={ctx} item={item} c={c} /></td>
                      <td><Estado editor={editor} item={item} c={c} onCambiar={(v) => cambiar(item.id, { estado_pago: v })} /></td>
                      <td><Pais editor={editor} item={item} c={c} onCambiar={(v) => cambiar(item.id, { pagado_en: v })} /></td>
                      <td>{editor
                        ? <input type="date" value={item.pago_estimado ?? ''} onChange={(e) => cambiar(item.id, { pago_estimado: e.target.value || null })} />
                        : item.pago_estimado ?? ''}</td>
                      {editor && <td className="acciones">
                        <a className="boton-chico" href={`#/item/${item.id}`} title="Cambiar rubro, proveedor, monto, hito…">Editar</a>
                        <button className="terciario chico peligro" title="Borrar este ítem" onClick={() => borrar(item)}>Borrar</button>
                      </td>}
                    </tr>
                  ))}
                  <tr className="total">
                    <td></td><td colSpan={4}>Subtotal</td>
                    <td className="num">{usd(t.incluido)}</td><td className="num">{usd(t.facturado)}</td><td className="num">{usd(t.pagado)}</td><td className="num">{usd(t.pendiente)}</td><td></td><td></td><td></td><td></td>{editor && <td></td>}
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

/** Archivos del ítem (propios, de sus facturas o de sus pagos). Si hay pagos o facturas y ningún adjunto, avisa que falta. */
function Adjuntos({ ctx, item, c }) {
  const { datos } = ctx;
  const facs = datos.facturas.filter((f) => f.item_id === item.id);
  const pagos = datos.movimientos.filter((m) => m.item_id === item.id);
  const docs = datos.documentos.filter((d) => d.item_id === item.id || facs.some((f) => f.id === d.factura_id) || pagos.some((p) => p.id === d.movimiento_id));
  const falta = !docs.some((d) => d.tipo === 'factura') && (pagos.length > 0 || facs.length > 0 || c.estado === 'pagado');
  return (
    <div className="adjuntos">
      {docs.map((d) => (
        <button key={d.id} className="clip" title={`${d.nombre}${d.tipo === 'factura' ? ' (factura)' : ''}`} onClick={() => abrirArchivo(d.ruta)}>
          📎{d.tipo === 'factura' ? '' : <span className="ayuda"> {d.tipo === 'comprobante' ? 'comp.' : d.tipo.slice(0, 5)}</span>}
        </button>
      ))}
      {falta && <span className="chip critico" title="Hay pagos o facturas cargados pero no está adjunta la factura">Falta factura</span>}
      <SubirArchivo ctx={ctx} vinculos={{ item_id: item.id, tipo: 'factura' }} texto="+" />
    </div>
  );
}

function Estado({ editor, item, c, onCambiar }) {
  const [nombre, clase] = ESTADOS_PAGO[c.estado] ?? ['—', ''];
  if (!editor) return c.estado ? <span className={`chip ${clase}`} title={item.estado_pago ? 'Marcado a mano' : 'Según los pagos cargados'}>{nombre}</span> : null;
  const auto = c.automatico ? ESTADOS_PAGO[c.automatico][0] : 'sin pagos';
  return (
    <select className={`estado ${item.estado_pago ? clase : 'auto'}`} value={item.estado_pago ?? ''} onChange={(e) => onCambiar(e.target.value || null)}
      title={item.estado_pago ? 'Marcado a mano' : 'Automático: según los pagos cargados en la cuenta'}>
      <option value="">Auto ({auto})</option>
      {Object.entries(ESTADOS_PAGO).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
    </select>
  );
}

function Pais({ editor, item, c, onCambiar }) {
  if (!editor) return c.pais ? <span title={item.pagado_en ? 'Marcado a mano' : 'Según los pagos cargados'}>{PAISES_PAGO[c.pais]}</span> : null;
  const auto = c.paisAuto ? PAISES_PAGO[c.paisAuto] : '—';
  return (
    <select className={`estado ${item.pagado_en ? '' : 'auto'}`} value={item.pagado_en ?? ''} onChange={(e) => onCambiar(e.target.value || null)}
      title={item.pagado_en ? 'Marcado a mano' : 'Automático: pagos de Magrausa = Uruguay, pagos directos de TM = Argentina'}>
      <option value="">Auto ({auto})</option>
      {Object.entries(PAISES_PAGO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
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
