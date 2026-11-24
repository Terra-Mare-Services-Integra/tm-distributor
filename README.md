# TM Distributor

Administración de la lancha **M/V DISTRIBUTOR** de Terra Mare: compra, acondicionamiento en Uruguay,
importación y, más adelante, operación.

- **Presupuestos**: ítems por etapa y por hito del contrato de servicios, con detalle del proveedor (cantidad × precio),
  Base/Opcional e “Incluir”; desvío contra lo facturado.
- **Facturas**: facturas de talleres (en Uruguay salen a nombre de Magrausa), con su PDF y el ítem al que corresponden.
- **Cuenta Magrausa**: giros desde el exterior, pagos que Magrausa hace por cuenta de Terra Mare, pagos directos,
  saldo, y conciliación automática con el Excel de estado de cuenta que manda Magrausa.
- **Cashflow**: real por mes y proyección de lo pendiente (por fecha estimada de pago) contra el saldo disponible.
- **Documentos**: bucket privado `distributor` en Supabase.

## Stack

React + Vite. Base: el Supabase de Terra Mare (mismo login y accesos que el portal), tablas `dist_*`.
Accesos en `tm_accesos.modulos`: `distributor` (ve) y `distributor-edita` (carga); se habilitan desde el panel de
Administración del portal.

**El repo es público: ningún monto, factura ni dato interno va al código.** Todo vive en la base. Los tests usan
números inventados. La carga inicial y el mock local están en `datos-locales/` (en `.gitignore`).

## Desarrollo

```
npm install
cp .env.example .env.local   # completar la anon key
npm run dev                  # http://localhost:5188
npm test
```

Migraciones en `supabase/migrations/`. Como el proyecto Supabase es compartido con otras apps de Terra Mare
(cada una con su propio historial de migraciones), se aplican con
`npx supabase db query --linked -f supabase/migrations/<archivo>.sql` y no con `db push`.
