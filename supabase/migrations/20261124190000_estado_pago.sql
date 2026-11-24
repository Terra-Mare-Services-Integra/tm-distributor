-- Estado de pago elegido a mano. NULL = automático (según los pagos cargados en la cuenta).
-- 'pagado' da el ítem por pagado aunque el pago no esté cargado (pendiente = 0).
-- 'pendiente' y 'a_confirmar' no cambian los montos: solo marcan el estado.
alter table public.dist_items
  add column if not exists estado_pago text
  check (estado_pago in ('pagado', 'pendiente', 'a_confirmar'));
