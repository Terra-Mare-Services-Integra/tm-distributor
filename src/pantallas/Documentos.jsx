import { useState } from 'react';
import { ListaArchivos, SubirArchivo, TIPOS_DOC } from '../componentes/Archivos.jsx';
import { hoy } from '../lib/formato.js';

export default function Documentos({ ctx }) {
  const { datos } = ctx;
  const [tipo, setTipo] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('contrato');
  const docs = datos.documentos.filter((d) => !tipo || d.tipo === tipo);
  return (
    <>
      <div className="encabezado">
        <div><h1>Documentos.</h1><div className="filete" /></div>
        <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>
          {Object.entries(TIPOS_DOC).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <p className="aviso">Todos los archivos de la lancha: facturas, comprobantes, estados de cuenta, certificados, contratos y documentación de importación.</p>
      <section><ListaArchivos ctx={ctx} docs={docs} vacio="No hay documentos." /></section>
      {ctx.editor && (
        <div className="fila-botones">
          <label>Subir como<select value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value)}>
            {Object.entries(TIPOS_DOC).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <SubirArchivo ctx={ctx} vinculos={{ tipo: tipoNuevo, fecha: hoy() }} texto="Subir archivos" />
        </div>
      )}
    </>
  );
}
