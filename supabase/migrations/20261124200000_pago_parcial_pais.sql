-- Estado "parcial" y dónde se pagó el ítem.
-- pagado_en NULL = automático: 'pago' (Magrausa) → Uruguay, 'pago_directo' (TM) → Argentina.
alter table public.dist_items drop constraint if exists dist_items_estado_pago_check;
alter table public.dist_items add constraint dist_items_estado_pago_check
  check (estado_pago in ('pagado', 'parcial', 'pendiente', 'a_confirmar'));

alter table public.dist_items
  add column if not exists pagado_en text
  check (pagado_en in ('uruguay', 'argentina', 'ambos'));
