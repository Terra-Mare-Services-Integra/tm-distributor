import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from './lib/supabase.js';
import Resumen from './pantallas/Resumen.jsx';
import Presupuestos from './pantallas/Presupuestos.jsx';
import Item from './pantallas/Item.jsx';
import Facturas from './pantallas/Facturas.jsx';
import Cuenta from './pantallas/Cuenta.jsx';
import Cashflow from './pantallas/Cashflow.jsx';
import Documentos from './pantallas/Documentos.jsx';

const MENU = [
  ['#/', 'Resumen'],
  ['#/presupuestos', 'Presupuestos'],
  ['#/facturas', 'Facturas'],
  ['#/cuenta', 'Cuenta Magrausa'],
  ['#/cashflow', 'Cashflow'],
  ['#/documentos', 'Documentos'],
];

function useRuta() {
  const [ruta, setRuta] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const f = () => { setRuta(window.location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta;
}

export default function App() {
  const [sesion, setSesion] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const ruta = useRuta();

  return (
    <div className="app">
      <header className="barra">
        <a href="#/" className="marca"><img src="/terramare-azul.png" alt="TERRAMARE" /></a>
        <div className="barra-titulo">
          <div className="overline">TM Distributor</div>
          <div className="barra-sub">M/V DISTRIBUTOR · compra, acondicionamiento e importación</div>
        </div>
        {sesion && (
          <nav className="menu">
            {MENU.map(([h, n]) => {
              const activo = h === '#/' ? ruta === '#/' || ruta === '' || ruta === '#' : ruta.startsWith(h) || (h === '#/presupuestos' && ruta.startsWith('#/item/'));
              return <a key={h} href={h} className={activo ? 'activo' : ''}>{n}</a>;
            })}
          </nav>
        )}
        <div className="usuario">
          <a className="volver-portal" href="https://integra.home.terra-mare.com.ar">← Portal</a>
          {sesion && <><span className="usuario-mail">{sesion.user.email}</span>
            <button className="terciario" onClick={() => supabase.auth.signOut()}>Salir</button></>}
        </div>
      </header>
      {sesion === undefined ? null : sesion ? <Distributor ruta={ruta} /> : <Ingreso />}
    </div>
  );
}

function Ingreso() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar(e) {
    e.preventDefault();
    setAviso(null); setEnviando(true);
    const r = await supabase.auth.signInWithPassword({ email, password: clave });
    setEnviando(false);
    if (r.error) setAviso(r.error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : r.error.message);
  }
  return (
    <main className="ingreso">
      <h1>Ingresar.</h1>
      <div className="filete" />
      <p className="aviso">Es la misma cuenta del portal de Terra Mare.</p>
      <form onSubmit={enviar}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        <button disabled={enviando}>Ingresar</button>
      </form>
      {aviso && <p className="aviso error">{aviso}</p>}
    </main>
  );
}

const TABLAS = {
  hitos: () => supabase.from('dist_hitos').select('*').order('n'),
  items: () => supabase.from('dist_items').select('*'),
  lineas: () => supabase.from('dist_item_lineas').select('*').order('orden'),
  facturas: () => supabase.from('dist_facturas').select('*').order('fecha', { ascending: false }),
  movimientos: () => supabase.from('dist_movimientos').select('*').order('fecha'),
  documentos: () => supabase.from('dist_documentos').select('*').order('created_at', { ascending: false }),
};

function Distributor({ ruta }) {
  const [acceso, setAcceso] = useState(undefined);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([supabase.rpc('dist_puede_ver'), supabase.rpc('dist_puede_editar')])
      .then(([v, e]) => setAcceso(v.data ? { editor: !!e.data } : null), () => setAcceso(null));
  }, []);

  const recargar = useCallback(async (...cuales) => {
    const nombres = cuales.length ? cuales : Object.keys(TABLAS);
    const res = await Promise.all(nombres.map((n) => TABLAS[n]()));
    const err = res.find((r) => r.error);
    if (err) { setError(err.error.message); return; }
    setDatos((d) => ({ ...(d ?? {}), ...Object.fromEntries(nombres.map((n, i) => [n, res[i].data])) }));
  }, []);
  useEffect(() => { if (acceso) recargar(); }, [acceso, recargar]);

  const ctx = useMemo(() => (datos ? { datos, editor: acceso?.editor, recargar } : null), [datos, acceso, recargar]);

  if (acceso === undefined) return <main><p className="aviso">Cargando…</p></main>;
  if (acceso === null) return (
    <main>
      <h1>Sin acceso.</h1><div className="filete" />
      <p className="aviso">Tu cuenta no tiene habilitado TM Distributor. Pedí el acceso desde el panel de Administración del portal Terra Mare.</p>
    </main>
  );
  if (error) return <main><p className="aviso error">No se pudieron leer los datos: {error}</p></main>;
  if (!ctx) return <main><p className="aviso">Cargando…</p></main>;

  const item = ruta.match(/^#\/item\/([\w-]+)/);
  return (
    <main>
      {item && <Item key={item[1]} ctx={ctx} id={item[1]} />}
      {!item && ruta.startsWith('#/presupuestos') && <Presupuestos ctx={ctx} />}
      {ruta.startsWith('#/facturas') && <Facturas ctx={ctx} />}
      {ruta.startsWith('#/cuenta') && <Cuenta ctx={ctx} />}
      {ruta.startsWith('#/cashflow') && <Cashflow ctx={ctx} />}
      {ruta.startsWith('#/documentos') && <Documentos ctx={ctx} />}
      {(ruta === '#/' || ruta === '#' || ruta === '') && <Resumen ctx={ctx} />}
    </main>
  );
}
