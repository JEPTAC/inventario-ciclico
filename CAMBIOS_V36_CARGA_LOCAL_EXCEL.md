# Cambios V36 - Carga local diaria Excel SIESA

## Objetivo
Se eliminó el flujo operativo de lectura por API de Google Drive para que el archivo diario de SIESA se cargue directamente desde la aplicación, ya sea desde computador o celular.

## Cambios principales

1. **Carga diaria dentro de la APP**
   - Nuevo módulo: `Carga diaria Excel SIESA`.
   - Se agregó selector de archivo `Excel_siesa.xls / .xlsx`.
   - El botón `Procesar Excel diario` lee el archivo local con SheetJS, sin OAuth ni permisos de administrador de Google.

2. **Reinicio de base operativa**
   - Al procesar el Excel diario, las tareas abiertas de operación (`assigned`, `recount_required`, `pending_inventory`) se marcan como `superseded_by_daily_upload`.
   - Los materiales quedan con `resetCountingCycle: true` y `countCycleDate` del día.
   - La programación diaria no usa `referenceMemory`, `lastCountDate` ni `annualCounted` anteriores para saltarse referencias.

3. **Lectura más fiel al Excel real de SIESA**
   - Mapeo directo de columnas:
     - `Referencia Item`
     - `Nombre Item`
     - `Unidad_inventario Item`
     - `Bodega`
     - `Ubicacion`
     - `Nombre Ubicacion`
     - `Lote`
     - `ABC_rotacion_costo`
     - `ABC_rotacion_veces`
     - `Costo_prom_uni`
     - `Costo_prom_tot`
     - `Cantidad_existencia_1`
     - `Cantidad_comprometida_1`
     - `Cantidad_disponible_1`
     - `Consumo_promedio`
   - Se conservan fechas de compra, venta, entrada y salida para trazabilidad.

4. **Notificaciones para conteo diario**
   - Al generar conteo obligatorio se activan alertas internas.
   - Se solicita permiso de notificación del navegador cuando sea posible.
   - La app dispara sonido y notificación para tareas nuevas/reconteos.

5. **Interfaz móvil/iOS**
   - Botones más grandes.
   - Diálogos tipo hoja inferior en celular.
   - Inputs con tamaño compatible con iPhone para evitar zoom automático.
   - Escáner con `playsinline` y fallback `jsQR` para Safari/iOS.

6. **QR y conteo por celular**
   - Se mantiene la lectura por QR/código.
   - En iPhone, si `BarcodeDetector` no existe, la app usa `jsQR` para QR y deja ingreso manual como respaldo para códigos de barras.

## Archivos tocados
- `index.html`
- `app.js`
- `styles.css`
- `CAMBIOS_V36_CARGA_LOCAL_EXCEL.md`
