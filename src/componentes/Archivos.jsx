import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fecha } from '../lib/formato.js';

export const TIPOS_DOC = {
  factura: 'Factura', comprobante: 'Comprobante de pago', estado_cuenta: 'Estado de cuenta', presupuesto: 'Presupuesto',
  certificado: 'Certificado', contrato: 'Contrato', otro: 'Otro',
};

const limpiar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

export async function abrirArchivo(ruta) {
  const { data, error } = await supabase.storage.from('distributor').createSignedUrl(ruta, 300);
  if (error) { alert(`No se pudo abrir: ${error.message}`); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

/** Sube uno o más archivos al bucket y los registra en dist_documentos con los vínculos dados. */
export async function subirArchivos(files, vinculos = {}) {
  for (const f of files) {
    const ruta = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID().slice(0, 8)}-${limpiar(f.name)}`;
    const up = await supabase.storage.from('distributor').upload(ruta, f, { contentType: f.type || undefined });
    if (up.error) throw new Error(`${f.name}: ${up.error.message}`);
    const ins = await supabase.from('dist_documentos').insert({
      ruta, nombre: f.name, tamano: f.size, mime: f.type || null, tipo: vinculos.tipo ?? 'otro',
      item_id: vinculos.item_id ?? null, factura_id: vinculos.factura_id ?? null, movimiento_id: vinculos.movimiento_id ?? null,
      fecha: vinculos.fecha ?? null,
    });
    if (ins.error) throw new Error(`${f.name}: ${ins.error.message}`);
  }
}

export function SubirArchivo({ ctx, vinculos, texto = 'Adjuntar archivo' }) {
  const [estado, setEstado] = useState(null);
  if (!ctx.editor) return null;
  return (
    <label className="subir">
      <span className="boton-chico">{estado === 'subiendo' ? 'Subiendo…' : texto}</span>
      <input type="file" multiple hidden disabled={estado === 'subiendo'} onChange={async (e) => {
        const files = [...e.target.files]; e.target.value = '';
        if (!files.length) return;
        setEstado('subiendo');
        try { await subirArchivos(files, vinculos); setEstado(null); ctx.recargar('documentos'); }
        catch (err) { setEstado(null); alert(err.message); }
      }} />
    </label>
  );
}

export function ListaArchivos({ ctx, docs, vacio = 'Sin archivos.' }) {
  if (!docs.length) return <p className="aviso">{vacio}</p>;
  return (
    <ul className="archivos">
      {docs.map((d) => (
        <li key={d.id}>
          <button className="enlace" onClick={() => abrirArchivo(d.ruta)}>{d.nombre}</button>
          <span className="chip">{TIPOS_DOC[d.tipo]}</span>
          {d.fecha && <span className="ayuda">{fecha(d.fecha)}</span>}
          {ctx.editor && <button className="terciario chico" title="Quitar" onClick={async () => {
            if (!confirm(`¿Borrar "${d.nombre}"? No se puede deshacer.`)) return;
            await supabase.storage.from('distributor').remove([d.ruta]);
            await supabase.from('dist_documentos').delete().eq('id', d.id);
            ctx.recargar('documentos');
          }}>×</button>}
        </li>
      ))}
    </ul>
  );
}
