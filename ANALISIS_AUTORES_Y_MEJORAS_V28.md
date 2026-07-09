# Inventario Cíclico SIESA — Análisis operativo y mejoras V28

## Enfoque técnico aplicado

La mejora se orientó a que la APP no solo registre conteos, sino que ayude a operar el proceso con menor sesgo, mayor trazabilidad y mejores decisiones sobre diferencias.

Se revisaron prácticas de inventario cíclico y exactitud de registros de inventario. Las conclusiones aplicables al proyecto son:

1. El conteo cíclico debe mantener la exactitud del inventario sin detener toda la operación.
2. La clasificación ABC/Pareto permite priorizar referencias de mayor valor, movimiento, variabilidad o criticidad.
3. La inexactitud del registro de inventario debe medirse y gestionarse porque afecta productividad, disponibilidad, decisiones de abastecimiento y uso de bodega.
4. El proceso no debe terminar en “hay diferencia”; debe clasificar causa, severidad, impacto económico y responsable de cierre.
5. El conteo ciego disminuye sesgos porque el usuario de inventario no copia el dato del sistema como cantidad física.

## Mejoras integradas a la APP

### 1. Conteo ciego para rol Inventario

Se agregó un parámetro configurable:

- `blindCountInventory: true`

Cuando está activo, el usuario con rol `inventario` no ve el stock del sistema en el formulario de conteo. El sistema conserva internamente la cantidad para calcular la diferencia al guardar.

Esto mejora la confiabilidad del conteo físico porque obliga a contar realmente y no a validar visualmente contra el dato esperado.

### 2. Calculadora operativa de diferencias

En el formulario de conteo se agregó un panel que calcula en vivo:

- Diferencia en unidades o metros.
- Porcentaje de diferencia frente al sistema.
- Impacto económico estimado.
- Semáforo de severidad.
- Recomendación operativa.

Semáforo aplicado:

- Exacto.
- Menor.
- Media.
- Crítica.

### 3. Parámetros de tolerancia y criticidad

En Configuración se agregaron nuevos campos:

- Conteo ciego inventario.
- % diferencia menor.
- % diferencia crítica.
- Valor diferencia crítica.

Valores iniciales:

- Diferencia menor: 1%.
- Diferencia crítica: 10%.
- Valor crítico: $500.000.

La APP no cierra automáticamente diferencias por tolerancia; la tolerancia se usa como semáforo y guía de decisión. Se mantiene el control fuerte de reconteo y aprobación.

### 4. Guardado técnico de la diferencia

Los registros en `counts` ahora guardan:

- `unitCost`
- `diffPercent`
- `diffValue`
- `severity`
- `recommendedAction`

Los casos que se generan por diferencia persistente también guardan:

- `unitCost`
- `diffPercent`
- `diffValue`
- `severity`

Esto permite auditar mejor y construir reportes de impacto real, no solo conteos con o sin diferencia.

### 5. Indicadores por valor y no solo por cantidad

Se mejoró el módulo Indicadores con:

- Exactitud reciente por referencia.
- Exactitud reciente por valor.
- Impacto total de diferencias.
- Impacto promedio por conteo.
- Cantidad de diferencias críticas.

Esto evita una lectura engañosa: una referencia puede ser una sola diferencia, pero representar mucho dinero.

### 6. Pareto de causas y criticidad

Se agregó una nueva tarjeta en Indicadores:

- Causas más repetidas.
- Valor asociado a esas causas.
- Semáforo de conteos recientes.

Esto permite enfocar acciones correctivas: ubicación, salidas no registradas, errores documentales, unidad de medida, ingreso no registrado, etc.

## QA ejecutado

Se validó:

- Sintaxis JavaScript con `node --check app.js`.
- JSON de `manifest.webmanifest`.
- JSON de `lineas_catalog.json`.
- Referencias JavaScript `$("#id")` contra IDs reales del HTML.
- Botones de navegación `data-view` contra secciones reales.
- Existencia de nuevos IDs agregados.
- Actualización del Service Worker a caché V28.

Resultado: sin errores sintácticos ni IDs JavaScript faltantes en la revisión estática.

## Archivos modificados

- `app.js`
- `index.html`
- `styles.css`
- `firebase-config.js`
- `service-worker.js`

## Recomendación de siguiente fase

La siguiente mejora recomendada es un módulo de “Plan de acción por diferencia”, donde cada diferencia media o crítica cree una acción correctiva con responsable, fecha compromiso, evidencia y estado. Esto convertiría el inventario cíclico en una herramienta de mejora continua, no solo de control.
