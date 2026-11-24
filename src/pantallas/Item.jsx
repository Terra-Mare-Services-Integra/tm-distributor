import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { cifrasItem, totalLineas, ETAPAS, TIPOS_MOV, ESTADOS_PAGO, PAISES_PAGO } from '../lib/calculos.js';
import { usd, usd2, fecha, aNumero } from '../lib/formato.js';
import { ListaArchivos, SubirArchivo } from '../componentes/Archivos.jsx';

export default function Item({ ctx, id }) {
  const { datos, editor, recargar } = ctx;
  const item = datos.items.find((i) => i.id === id);
  if (!item) return <><p className="aviso">No encontré ese ítem.</p><a href="#/presupuestos">← Presupuestos</a></>;
  const c = cifrasItem(item, datos.facturas, datos.movimientos);
  const lineas = datos.lineas.filter((l) => l.item_id === id);
  const sumaLineas = totalLineas(lineas);
  const facturas = datos.facturas.filter((f) => f.item_id === id);
  const pagos = datos.movimientos.filter((m) => m.item_id === id);
  const docs = datos.documentos.filter((d) => d.item_id === id || facturas.some((f) => f.id === d.factura_id) || pagos.some((p) => p.id === d.movimiento_id));
  const hito = datos.hitos.find((h) => h.n === item.hito);

  return (
    <>
      <a href="#/presupuestos" className="volver">← Presupuestos</a>
      <div className="encabezado">
        <div>
          <div className="overline">{ETAPAS.find(([k]) => k === item.etapa)?.[1]}{hito ? ` · Hito ${hito.n} · ${hito.nombre}` : ''}</div>
          <h1>{item.rubro}</h1>
          <div className="filete" />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="etiqueta">Cotizado</div><div className="kpi-valor mono">{usd(c.cotizado)}</div>{item.formula && <div className="ayuda">{item.formula}</div>}</div>
        <div className="kpi"><div className="etiqueta">Facturado</div><div className="kpi-valor mono">{usd(c.facturado)}</div>{c.desvio ? <div className={`ayuda${c.desvio > 0 ? ' rojo' : ''}`}>Desvío {c.desvio > 0 ? '+' : ''}{usd(c.desvio)}</div> : null}</div>
        <div className="kpi"><div className="etiqueta">Pagado</div><div className="kpi-valor mono">{usd(c.pagado)}</div></div>
        <div className="kpi"><div className="etiqueta">Pendiente</div><div className="kpi-valor mono">{usd(c.pendiente)}</div>{!item.incluir && <div className="ayuda">No incluido en el total</div>}</div>
      </div>

      <Datos ctx={ctx} item={item} />

      <section>
        <h3>Detalle del presupuesto</h3>
        {sumaLineas != null && c.cotizado != null && Math.abs(sumaLineas - c.cotizado) > 0.005 && (
          <p className="aviso error">La suma del detalle (USD {usd(sumaLineas)}) no coincide con el monto cotizado (USD {usd(c.cotizado)}).</p>
        )}
        <Lineas ctx={ctx} itemId={id} lineas={lineas} />
      </section>

      <section>
        <h3>Facturas</h3>
        {facturas.length ? (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Número</th><th>Concepto</th><th className="num">Total</th></tr></thead>
            <tbody>{facturas.map((f) => (
              <tr key={f.id}><td>{fecha(f.fecha)}</td><td>{f.proveedor}</td><td className="mono">{f.numero}</td><td>{f.concepto}</td><td className="num">{f.moneda} {usd2(f.total)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="aviso">Sin facturas. Se cargan en <a href="#/facturas">Facturas</a>.</p>}
      </section>

      <section>
        <h3>Pagos</h3>
        {pagos.length ? (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th className="num">Monto</th></tr></thead>
            <tbody>{pagos.map((m) => (
              <tr key={m.id}><td>{fecha(m.fecha)}</td><td>{TIPOS_MOV[m.tipo]}</td><td>{m.descripcion}</td><td className="num">{usd2(m.monto)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="aviso">Sin pagos. Se cargan en <a href="#/cuenta">Cuenta Magrausa</a>.</p>}
      </section>

      <section>
        <h3>Archivos</h3>
        <ListaArchivos ctx={ctx} docs={docs} />
        <div className="fila-botones"><SubirArchivo ctx={ctx} vinculos={{ item_id: id, tipo: 'presupuesto' }} texto="Adjuntar presupuesto u otro archivo" /></div>
      </section>

      {editor && (
        <div className="bloque">
          <button className="terciario peligro" onClick={async () => {
            if (facturas.length || pagos.length) { alert('El ítem tiene facturas o pagos asociados: primero desvinculalos.'); return; }
            if (!confirm(`¿Borrar "${item.rubro}" y su detalle? No se puede deshacer.`)) return;
            const { error } = await supabase.from('dist_items').delete().eq('id', id);
            if (error) { alert(error.message); return; }
            await recargar('items', 'lineas');
            window.location.hash = '#/presupuestos';
          }}>Borrar ítem</button>
        </div>
      )}
    </>
  );
}

function Datos({ ctx, item }) {
  const { datos, editor, recargar } = ctx;
  const inicial = {
    rubro: item.rubro, proveedor: item.proveedor, etapa: item.etapa, hito: item.hito ?? '', tipo: item.tipo,
    monto: item.monto_cotizado ?? '', formula: item.formula, cotizado_el: item.cotizado_el ?? '',
    pago_estimado: item.pago_estimado ?? '', estado_pago: item.estado_pago ?? '', pagado_en: item.pagado_en ?? '', observaciones: item.observaciones,
  };
  const [f, setF] = useState(inicial);
  const [aviso, setAviso] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setAviso(null); };
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial);

  async function guardar(e) {
    e.preventDefault();
    const { error } = await supabase.from('dist_items').update({
      rubro: f.rubro.trim(), proveedor: f.proveedor.trim(), etapa: f.etapa, hito: f.hito === '' ? null : Number(f.hito), tipo: f.tipo,
      monto_cotizado: aNumero(f.monto), formula: f.formula, cotizado_el: f.cotizado_el || null, pago_estimado: f.pago_estimado || null, estado_pago: f.estado_pago || null, pagado_en: f.pagado_en || null,
      observaciones: f.observaciones,
    }).eq('id', item.id);
    if (error) setAviso({ error: true, texto: error.message });
    else { setAviso({ texto: 'Guardado.' }); recargar('items'); }
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <fieldset disabled={!editor}>
        <div className="rejilla">
          <label>Rubro<input required value={f.rubro} onChange={set('rubro')} /></label>
          <label>Proveedor<input value={f.proveedor} onChange={set('proveedor')} /></label>
          <label>Etapa<select value={f.etapa} onChange={set('etapa')}>{ETAPAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Hito<select value={f.hito} onChange={set('hito')}><option value="">Sin hito</option>
            {datos.hitos.map((h) => <option key={h.n} value={h.n}>{h.n}. {h.nombre}</option>)}</select></label>
          <label>Tipo<select value={f.tipo} onChange={set('tipo')}><option value="base">Base</option><option value="opcional">Opcional</option></select></label>
          <label>Monto cotizado (USD)<input inputMode="decimal" value={f.monto} onChange={set('monto')} /></label>
          <label>Cómo se calcula<input value={f.formula} onChange={set('formula')} placeholder="opcional" /></label>
          <label>Fecha de cotización<input type="date" value={f.cotizado_el} onChange={set('cotizado_el')} /></label>
          <label>Pago estimado<input type="date" value={f.pago_estimado} onChange={set('pago_estimado')} /></label>
          <label>Estado de pago<select value={f.estado_pago} onChange={set('estado_pago')}><option value="">Automático (según pagos)</option>
            {Object.entries(ESTADOS_PAGO).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Pagado en<select value={f.pagado_en} onChange={set('pagado_en')}><option value="">Automático (según pagos)</option>
            {Object.entries(PAISES_PAGO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        </div>
        <label className="ancho">Observaciones<textarea rows={2} value={f.observaciones} onChange={set('observaciones')} /></label>
      </fieldset>
      {editor && <div className="fila-botones"><button disabled={!cambiado}>Guardar</button>
        {aviso && <span className={aviso.error ? 'aviso error' : 'aviso ok'}>{aviso.texto}</span>}</div>}
      {item.updated_by && <p className="ayuda">Última modificación: {item.updated_by}, {new Date(item.updated_at).toLocaleString('es-AR')}</p>}
    </form>
  );
}

function Lineas({ ctx, itemId, lineas }) {
  const { editor, recargar } = ctx;
  async function cambiar(id, campo, valor) {
    const v = campo === 'cantidad' || campo === 'precio' ? aNumero(valor) : valor;
    const { error } = await supabase.from('dist_item_lineas').update({ [campo]: v }).eq('id', id);
    if (error) alert(error.message); else recargar('lineas');
  }
  const total = totalLineas(lineas);
  return (
    <>
      {lineas.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Código</th><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unit.</th><th className="num">Subtotal</th>{editor && <th></th>}</tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id}>
                  <td><Celda editor={editor} valor={l.codigo} corto onGuardar={(v) => cambiar(l.id, 'codigo', v)} /></td>
                  <td><Celda editor={editor} valor={l.descripcion} onGuardar={(v) => cambiar(l.id, 'descripcion', v)} /></td>
                  <td className="num"><Celda editor={editor} valor={l.cantidad} num onGuardar={(v) => cambiar(l.id, 'cantidad', v)} /></td>
                  <td className="num"><Celda editor={editor} valor={l.precio} num onGuardar={(v) => cambiar(l.id, 'precio', v)} /></td>
                  <td className="num">{l.precio == null ? '' : usd2(Number(l.cantidad ?? 1) * Number(l.precio))}</td>
                  {editor && <td><button className="terciario chico" title="Quitar línea" onClick={async () => {
                    await supabase.from('dist_item_lineas').delete().eq('id', l.id); recargar('lineas');
                  }}>×</button></td>}
                </tr>
              ))}
              {total != null && <tr className="total"><td></td><td colSpan={3}>Total del detalle</td><td className="num">{usd2(total)}</td>{editor && <td></td>}</tr>}
            </tbody>
          </table>
        </div>
      )}
      {!lineas.length && <p className="aviso">Sin detalle.</p>}
      {editor && <div className="fila-botones"><button className="secundario chico" onClick={async () => {
        const { error } = await supabase.from('dist_item_lineas').insert({ item_id: itemId, orden: lineas.length, cantidad: 1 });
        if (error) alert(error.message); else recargar('lineas');
      }}>+ Línea</button></div>}
    </>
  );
}

function Celda({ editor, valor, onGuardar, num, corto }) {
  const texto = valor == null ? '' : num ? String(valor).replace('.', ',') : String(valor);
  const [v, setV] = useState(texto);
  if (!editor) return <>{num && valor != null ? usd2(valor) : texto}</>;
  return <input className={`celda${num ? ' num' : ''}${corto ? ' corta' : ''}`} value={v} inputMode={num ? 'decimal' : undefined}
    onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== texto) onGuardar(v); }}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
