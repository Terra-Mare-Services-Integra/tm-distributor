-- TM Distributor: costos de la lancha M/V DISTRIBUTOR (acondicionamiento, importación, compra, operación).
-- Corre sobre el Supabase de Terra Mare (mismo login y accesos que el portal). Tablas dist_*.
-- Accesos en tm_accesos.modulos: 'distributor' (ve) / 'distributor-edita' (carga); tm_admins ven y editan todo.
-- Los montos NO van en este repo (es público): se cargan en la base.

create or replace function public.dist_puede_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tm_es_admin() or exists (
    select 1 from public.tm_accesos where user_id = auth.uid() and modulos && array['distributor', 'distributor-edita'])
$$;

create or replace function public.dist_puede_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tm_es_admin() or exists (
    select 1 from public.tm_accesos where user_id = auth.uid() and 'distributor-edita' = any(modulos))
$$;

create or replace function public.dist_email() returns text language sql stable as $$ select lower(auth.jwt() ->> 'email') $$;

create or replace function public.dist_tocar()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := public.dist_email();
  return new;
end $$;

-- ─── Hitos (cláusula 4 del contrato con Magrausa) ────────────────────────────
create table public.dist_hitos (
  n int primary key,
  nombre text not null,
  tareas text not null default ''
);
insert into public.dist_hitos (n, nombre, tareas) values
  (1, 'Calderería y mantenimiento de superficie', '01 a 11'),
  (2, 'Prefectura – COTEC', '12 a 14'),
  (3, 'Electricidad', '15 y 16'),
  (4, 'Waterjet Hamilton / propulsión', '17 y 18'),
  (5, 'Motores', '19 a 24'),
  (6, 'Comunicaciones', '25 y 26'),
  (7, 'Grúa de cubierta', '27 y 28'),
  (8, 'Acondicionamiento de interiores', '29'),
  (9, 'Incorporación a la matrícula', '30 a 32'),
  (10, 'Certificaciones UMS y seguridad', '33 a 35');

-- ─── Ítems de presupuesto ────────────────────────────────────────────────────
create table public.dist_items (
  id uuid primary key default gen_random_uuid(),
  n int,
  etapa text not null default 'acondicionamiento'
    check (etapa in ('compra', 'acondicionamiento', 'importacion', 'operacion', 'otros')),
  hito int references public.dist_hitos (n),
  rubro text not null check (length(trim(rubro)) > 0),
  proveedor text not null default '',
  cotizado_el date,
  tipo text not null default 'base' check (tipo in ('base', 'opcional')),
  incluir boolean not null default true,
  monto_cotizado numeric(14, 2),
  formula text not null default '',
  pago_estimado date,
  observaciones text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text default public.dist_email()
);
create trigger dist_items_tocar before update on public.dist_items for each row execute function public.dist_tocar();

-- Detalle del presupuesto del proveedor (cantidad × precio unitario).
create table public.dist_item_lineas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.dist_items (id) on delete cascade,
  orden int not null default 0,
  codigo text not null default '',
  descripcion text not null default '',
  cantidad numeric(12, 3),
  precio numeric(14, 2)
);
create index dist_item_lineas_item on public.dist_item_lineas (item_id);

-- ─── Facturas de proveedores ─────────────────────────────────────────────────
create table public.dist_facturas (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null check (length(trim(proveedor)) > 0),
  numero text not null default '',
  fecha date not null,
  moneda text not null default 'USD' check (moneda in ('USD', 'UYU', 'ARS', 'EUR')),
  total numeric(14, 2) not null,
  emitida_a text not null default '',
  item_id uuid references public.dist_items (id) on delete set null,
  trabajo_el date,
  concepto text not null default '',
  nota text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text default public.dist_email()
);
create trigger dist_facturas_tocar before update on public.dist_facturas for each row execute function public.dist_tocar();
create index dist_facturas_item on public.dist_facturas (item_id);

-- ─── Movimientos de dinero ───────────────────────────────────────────────────
-- giro:         TM gira a Magrausa (monto = lo acreditado; enviado = lo que salió; la diferencia es gasto bancario).
-- pago:         Magrausa paga a un proveedor por cuenta de TM (baja el saldo en Magrausa).
-- pago_directo: TM paga directo (Argentina u otra cuenta); no toca el saldo en Magrausa.
-- ajuste:       corrección del saldo en Magrausa con signo.
create table public.dist_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('giro', 'pago', 'pago_directo', 'ajuste')),
  descripcion text not null default '',
  monto numeric(14, 2) not null,
  enviado numeric(14, 2),
  ordenante text not null default '',
  item_id uuid references public.dist_items (id) on delete set null,
  factura_id uuid references public.dist_facturas (id) on delete set null,
  asiento_magrausa text not null default '',
  nota text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text default public.dist_email(),
  check (tipo = 'ajuste' or monto > 0)
);
create trigger dist_movimientos_tocar before update on public.dist_movimientos for each row execute function public.dist_tocar();
create index dist_movimientos_item on public.dist_movimientos (item_id);
create index dist_movimientos_factura on public.dist_movimientos (factura_id);

-- ─── Documentos (bucket privado "distributor") ───────────────────────────────
create table public.dist_documentos (
  id uuid primary key default gen_random_uuid(),
  ruta text not null unique,
  nombre text not null,
  tipo text not null default 'otro'
    check (tipo in ('factura', 'comprobante', 'estado_cuenta', 'presupuesto', 'certificado', 'contrato', 'otro')),
  item_id uuid references public.dist_items (id) on delete set null,
  factura_id uuid references public.dist_facturas (id) on delete set null,
  movimiento_id uuid references public.dist_movimientos (id) on delete set null,
  fecha date,
  nota text not null default '',
  tamano bigint,
  mime text,
  created_at timestamptz not null default now(),
  created_by text not null default public.dist_email()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['dist_hitos', 'dist_items', 'dist_item_lineas', 'dist_facturas', 'dist_movimientos', 'dist_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "%s: ver" on public.%I for select to authenticated using (public.dist_puede_ver())', t, t);
    execute format('create policy "%s: editar" on public.%I for all to authenticated using (public.dist_puede_editar()) with check (public.dist_puede_editar())', t, t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('distributor', 'distributor', false, 52428800)
on conflict (id) do nothing;

create policy "distributor archivos: ver" on storage.objects for select to authenticated
  using (bucket_id = 'distributor' and public.dist_puede_ver());
create policy "distributor archivos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'distributor' and public.dist_puede_editar());
create policy "distributor archivos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'distributor' and public.dist_puede_editar());
