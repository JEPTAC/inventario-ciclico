# QA V31 — Codificación competitiva

## Validaciones realizadas

- Sintaxis JavaScript de `app.js` validada con `node --check`.
- Sintaxis del Service Worker validada con `node --check`.
- JSON de `manifest.webmanifest` validado.
- JSON de `lineas_catalog.json` validado.
- IDs HTML duplicados revisados: sin duplicados.
- Selectores nuevos revisados:
  - `quickQrKind`
  - `quickQrRef`
  - `quickQrDescription`
  - `quickQrLocation`
  - `quickQrUnit`
  - `quickLabelDraft`
  - `quickLabelQueue`
  - `createQuickLabelBtn`
  - `printQuickLabelBtn`
  - `clearLabelQueueBtn`
  - `countCodePanel`

## Funciones nuevas verificadas estáticamente

- `inventoryCode()`
- `inventoryPayload()`
- `resolveInternalCode()`
- `normalizeScanPayload()` con compatibilidad anterior `MAT:` y `LOC:`
- `labelItemFromMaterial()`
- `labelItemFromLocation()`
- `buildManualLabelItem()`
- `addLabelToQueue()`
- `persistGeneratedLabel()`
- `printLabelItems()`
- `renderCountCodePanel()`

## Compatibilidad conservada

La V31 conserva las funciones V30:

- Conteo Express.
- Modo offline avanzado.
- Mapa de calor.
- Ranking de causas.
- Tiempos por conteo.
- Informe PDF por caso.
- Alertas inteligentes.
- Tablero ejecutivo gerencial.

## Observaciones de despliegue

Después de subir esta versión se debe publicar también `firestore.rules`, porque se agregó la colección `generatedLabels` para trazabilidad de códigos creados.

También se debe hacer Ctrl + F5 para limpiar caché y tomar el Service Worker V31.
