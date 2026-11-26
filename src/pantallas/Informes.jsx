import { abrirArchivo, SubirArchivo } from '../componentes/Archivos.jsx';
import { fecha, hoy } from '../lib/formato.js';

/** Informes semanales de obra: un PDF por semana, con fecha de cierre y resumen. */
export default function Informes({ ctx }) {
  const docs = ctx.datos.documentos.filter((d) => d.tipo === 'informe')
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.nombre.localeCompare(a.nombre));
  return (
    <>
      <div className="encabezado"><div><h1>Informes semanales.</h1><div className="filete" /></div></div>
      <p className="aviso">Seguimiento de la obra en Piriápolis, semana a semana.</p>
      {!docs.length && <div className="vacio">Todavía no hay informes.</div>}
      <section className="informes">
        {docs.map((d) => (
          <article key={d.id} className="informe">
            <div className="informe-cabeza">
              <button className="enlace" onClick={() => abrirArchivo(d.ruta)}>📄 {d.nombre.replace(/\.pdf$/i, '')}</button>
              {d.fecha && <span className="ayuda">{fecha(d.fecha)}</span>}
            </div>
            {d.nota && <p>{d.nota}</p>}
          </article>
        ))}
      </section>
      {ctx.editor && <div className="fila-botones"><SubirArchivo ctx={ctx} vinculos={{ tipo: 'informe', fecha: hoy() }} texto="Subir informe" /></div>}
    </>
  );
}
