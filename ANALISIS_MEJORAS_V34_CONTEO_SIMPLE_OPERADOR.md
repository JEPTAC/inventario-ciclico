# V34 · Conteo simple por auxiliar y flujo individual por rol

## Objetivo

La V34 corrige la experiencia del rol inventario/auxiliar para que el conteo sea más transparente, simple y responsable. El auxiliar ya no ve stock del sistema, valor inventario, riesgo, diferencia calculada, impacto económico ni botones de impresión dentro de Conteo Express. Su flujo queda reducido a: seleccionar tarea, confirmar referencia/nombre/ubicación/unidad, escribir cantidad física y guardar.

## Referencias de competencia aplicadas

- NetSuite Smart Count documenta preferencias como conteo ciego, tolerancias y entrada manual por rol. La app adopta conteo ciego obligatorio para inventario.
- Odoo Barcode permite contar por ubicación y asignar productos al escanear una ubicación. La app conserva ubicación/referencia como entrada operativa.
- Sortly e inFlow priorizan escaneo, etiquetas QR/código de barras, acceso móvil y simplicidad para equipos no técnicos. La app separa conteo de impresión de stickers.
- inFlow Stockroom destaca balance entre información administrativa y operación simple de stock. La V34 replica ese principio: el auxiliar cuenta; jefe/auditoría/gerencia analizan.

## Cambios funcionales

1. Rol inventario renombrado visualmente como Auxiliar de inventario.
2. Módulo principal del auxiliar: Conteo simple.
3. Menú del auxiliar simplificado: Conteo simple, Mis pendientes, Historial y Etiquetas diarias.
4. Se ocultan módulos no operativos para inventario: Panel general, metraje avanzado, materiales, líneas, indicadores, configuración y Drive.
5. Conteo ciego obligatorio para inventario, sin depender del parámetro configurable.
6. El auxiliar no ve stock sistema, diferencia, porcentaje, valor ni severidad durante el conteo.
7. El auxiliar tampoco ve cantidades históricas de la memoria de referencia, solo la existencia de memoria y la fecha del último conteo.
8. Se eliminan acciones de sticker dentro de Conteo simple para inventario.
9. La creación e impresión de stickers queda centralizada en Etiquetas diarias.
10. Se agregan botones: Cargar pendientes de hoy e Imprimir stickers diarios.
11. En conteo offline, el auxiliar puede guardar sin foto obligatoria para no romper el conteo ciego; la evidencia queda como validación posterior del jefe si aplica.
12. En historial del auxiliar se ocultan sistema, diferencia y valor; solo ve que registró cantidad física y tiempo.

## Resultado esperado

El auxiliar no interpreta, no decide y no valida. Solo registra el dato físico. La APP calcula y escala después, manteniendo trazabilidad completa para jefe logístico, auditoría y gerencia.

## Diseño aplicado

- Tarjeta principal más grande.
- Un solo botón principal: Contar ahora.
- Cantidad física con campo grande.
- Botonera numérica amplia.
- Botón visible Guardar y siguiente.
- Panel responsive automático para pantallas bajas de 760 px o menos.
- Etiquetas e impresión separadas del flujo de conteo.

## Próxima mejora sugerida

Crear un modo “ruta guiada de bodega”, donde la APP ordene automáticamente los pendientes por ubicación física para que el auxiliar camine en secuencia: bodega, pasillo, estante, nivel y referencia.
