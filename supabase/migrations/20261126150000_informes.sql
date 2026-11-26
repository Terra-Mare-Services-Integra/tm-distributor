-- Informes semanales de obra (los manda el representante en Uruguay): nuevo tipo de documento.
alter table public.dist_documentos drop constraint if exists dist_documentos_tipo_check;
alter table public.dist_documentos add constraint dist_documentos_tipo_check
  check (tipo in ('factura', 'comprobante', 'estado_cuenta', 'presupuesto', 'certificado', 'contrato', 'informe', 'otro'));
