# QA V34 · Conteo simple por auxiliar

## Validaciones ejecutadas

- `node --check app.js`: OK.
- `node --check service-worker.js`: OK.
- `manifest.webmanifest`: JSON válido.
- `lineas_catalog.json`: JSON válido.
- HTML sin IDs duplicados.
- Botones nuevos conectados en JavaScript:
  - `loadDailyLabelsBtn`
  - `printDailyLabelsBtn`
  - `printQrLabelsBtn`
  - `printAllQrLabelsBtn`
- Campos principales de Conteo simple existentes y conectados:
  - `expressTitle`
  - `expressHelpText`
  - `expressListTitle`
  - `expressListHelp`
  - `countSystemQty`
  - `countDiffPreview`

## Pruebas lógicas revisadas

1. El rol inventario entra por defecto a `expressView`.
2. `dashboardView` ya no queda disponible para inventario.
3. `cableView`, `materialsView`, `lineCatalogView`, `indicatorsView`, `configView` y `driveView` no quedan disponibles para inventario.
4. `shouldBlindCount()` siempre retorna verdadero para rol inventario.
5. Conteo simple no muestra diferencia ni impacto al auxiliar.
6. Conteo simple no muestra botones de stickers al auxiliar.
7. El panel de códigos dentro del diálogo de conteo se oculta al auxiliar.
8. Historial del auxiliar no muestra stock sistema, diferencia ni valor.
9. La impresión de stickers diarios se realiza desde Etiquetas / Códigos.
10. Service Worker actualizado a V34.

## Observación

La validación ejecutada es estática y lógica. La prueba final debe hacerse en navegador con un usuario real rol inventario y otro rol jefe_logistico para verificar permisos reales de Firestore y flujo de aprobación.
