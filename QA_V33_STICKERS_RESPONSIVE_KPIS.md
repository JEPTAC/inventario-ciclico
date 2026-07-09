# QA V33 — Stickers, responsive y KPIs

## Validaciones ejecutadas

### Sintaxis

- `node --check app.js`: OK.
- `node --check service-worker.js`: OK.
- `manifest.webmanifest`: JSON válido.
- `lineas_catalog.json`: JSON válido.

### HTML / JavaScript

Se validaron los botones nuevos:

- `printQrLabelsBtn` existe en HTML y tiene evento en JS.
- `printAllQrLabelsBtn` existe en HTML y tiene evento en JS.
- `printQuickLabelBtn` conserva evento funcional.
- `clearLabelQueueBtn` conserva evento funcional.

### Impresión

Se revisó que `printLabelItems()`:

- reciba cualquier cantidad de etiquetas;
- divida en páginas de 16;
- complete la última página con placeholders invisibles;
- genere hoja carta con `@page size: letter`;
- conserve QR, código de barras y campo de stock físico;
- no dependa de botones falsos o decorativos.

### Responsive

Se validó que la APP agregue clases automáticas al elemento `html`:

- `auto-wide`.
- `auto-compact`.
- `auto-ultra-compact`.
- `auto-low-res`.

El modo se actualiza en:

- carga inicial;
- cambio de tamaño de ventana;
- cambio de orientación.

### Indicadores

Se agregó y validó la función `inventoryHealthMetrics()` con métricas calculadas desde `counts`, `countTasks`, `materials` y `referenceMemory`.

## Observaciones

- La impresión de QR y código de barras usa servicios externos (`api.qrserver.com` y `bwipjs-api.metafloor.com`). Si no hay internet, la vista puede abrir pero las imágenes nuevas podrían no cargar.
- La memoria histórica de referencias se conserva desde `referenceMemory` y se fusiona con los datos del Excel SIESA cuando se sincroniza.
- Se recomienda recargar con Ctrl + F5 después de publicar para forzar el Service Worker V33.
