import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

/** Crea un hito con el número siguiente y devuelve su número (o null si falló). */
export async function crearHito(ctx, nombre, tareas = '') {
  const n = Math.max(0, ...ctx.datos.hitos.map((h) => h.n)) + 1;
  const { error } = await supabase.from('dist_hitos').insert({ n, nombre: nombre.trim(), tareas: tareas.trim() });
  if (error) { alert(error.message); return null; }
  await ctx.recargar('hitos');
  return n;
}

const NUEVO = '__nuevo__';

/** Select de hito con la opción de crear uno nuevo en el momento. value: número o ''. */
export function SelectorHito({ ctx, value, onChange }) {
  async function elegir(e) {
    if (e.target.value !== NUEVO) { onChange(e.target.value); return; }
    const nombre = window.prompt('Nombre del hito nuevo:');
    if (!nombre?.trim()) return;
    const n = await crearHito(ctx, nombre);
    if (n != null) onChange(String(n));
  }
  return (
    <select value={value} onChange={elegir}>
      <option value="">Sin hito</option>
      {ctx.datos.hitos.map((h) => <option key={h.n} value={h.n}>{h.n}. {h.nombre}</option>)}
      {ctx.editor && <option value={NUEVO}>+ Crear hito nuevo…</option>}
    </select>
  );
}

/** Botón + formulario para crear un hito desde Presupuestos. */
export function NuevoHito({ ctx }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: '', tareas: '' });
  if (!abierto) return <button className="secundario" onClick={() => setAbierto(true)}>+ Nuevo hito</button>;
  async function guardar(e) {
    e.preventDefault();
    if (await crearHito(ctx, f.nombre, f.tareas) != null) { setF({ nombre: '', tareas: '' }); setAbierto(false); }
  }
  return (
    <form className="formulario" onSubmit={guardar}>
      <h3>Nuevo hito <span className="ayuda">· será el N° {Math.max(0, ...ctx.datos.hitos.map((h) => h.n)) + 1}</span></h3>
      <div className="rejilla">
        <label>Nombre<input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label>Tareas del Anexo I<input value={f.tareas} placeholder="opcional, ej. 33 a 36" onChange={(e) => setF({ ...f, tareas: e.target.value })} /></label>
      </div>
      <div className="fila-botones"><button>Crear</button><button type="button" className="terciario" onClick={() => setAbierto(false)}>Cancelar</button></div>
    </form>
  );
}
