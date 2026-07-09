# Inventario Cíclico SIESA — Mejoras V29 Conteo Express

## Objetivo de la versión

La V29 convierte el aplicativo en una herramienta más cómoda para bodega. La mejora principal es pasar de operar el conteo desde tablas a operar desde un flujo rápido: ubicación, referencia, cantidad física, evidencia y siguiente tarea.

## Mejoras implementadas

### 1. Nuevo módulo Conteo Express

Se agregó el módulo `expressView`, visible para `super_admin` e `inventario`.

Incluye:

- progreso del día;
- pendientes de hoy;
- reconteos abiertos;
- tareas de alto riesgo;
- filtro por ubicación;
- filtro por referencia;
- botón de conteo directo;
- lista rápida por tarjetas;
- prioridad por fecha, reconteo, riesgo y valor.

### 2. Conteo por ubicación

El usuario puede escribir o escanear una ubicación para que la app filtre automáticamente las tareas de esa zona. Esto facilita caminar físicamente por bodega sin buscar referencia por referencia.

### 3. Escáner QR / código de barras

Se agregó un diálogo de escaneo usando `BarcodeDetector` cuando el navegador lo soporte.

El lector interpreta:

- `LOC:Ubicación` para ubicación;
- `MAT:Referencia` para material;
- `REF:Referencia` para material;
- texto simple como referencia o ubicación según el modo de escaneo activo.

También incluye campo manual cuando el navegador no permita cámara o lectura automática.

### 4. Guardar y siguiente

El formulario de conteo ahora tiene botón `Guardar y siguiente`. Al guardar, la app refresca datos y abre automáticamente la siguiente tarea del filtro actual.

### 5. Teclado rápido de cantidad

Se agregaron botones:

- `-10`, `-5`, `-1`;
- limpiar;
- `+1`, `+5`, `+10`, `+100`.

Esto mejora la experiencia en celular o tablet.

### 6. Evidencia obligatoria por severidad

La app ahora valida antes de guardar:

- diferencia crítica: foto obligatoria si el parámetro está activo;
- cable/metraje con diferencia: foto obligatoria si el parámetro está activo;
- diferencia media o crítica: requiere causa, soporte u observación según configuración.

Parámetros nuevos:

- `highRiskScoreThreshold`;
- `requirePhotoCritical`;
- `requirePhotoCableDiff`;
- `requireEvidenceMedium`;
- `expressAutoAdvance`;
- `offlineQueueEnabled`.

### 7. Score de riesgo por referencia

Se agregó cálculo de riesgo operativo por tarea. El score combina:

- banda ABC;
- valor del inventario;
- movimiento;
- variabilidad;
- días sin contar;
- historial de diferencias;
- si es reconteo;
- si es metraje de cable.

La app clasifica el riesgo como bajo, control, medio o alto.

### 8. Vista móvil por tarjetas

En móvil, las tareas se presentan como tarjetas operativas. La tabla queda disponible en escritorio, pero en celular se prioriza tarjeta limpia con referencia, descripción, ubicación, valor, riesgo y acción.

### 9. Historial de conteos

Se agregó el módulo `historyView` para que inventario consulte sus conteos recientes. El super admin puede ver el historial general reciente.

Incluye:

- sistema;
- físico;
- diferencia;
- valor;
- severidad;
- tiempo promedio registrado;
- usuario.

### 10. Etiquetas QR

Se agregó el módulo `qrLabelsView`, visible para `super_admin` y `jefe_logistico`.

Permite generar e imprimir etiquetas para:

- referencias: `MAT:referencia`;
- ubicaciones: `LOC:ubicación`.

### 11. Indicadores ampliados

El módulo Indicadores ahora incluye:

- Pareto de causas;
- mapa de calor por ubicación;
- referencias con diferencias repetidas;
- productividad por usuario con tiempo promedio;
- semáforo de conteos.

### 12. Menú simplificado por rol

El rol `inventario` queda enfocado en:

- Panel;
- Conteo Express;
- Mis pendientes;
- Historial;
- Metraje cables.

Los módulos administrativos quedan para jefe logístico, auditoría, gerencia y super admin.

### 13. Persistencia offline

Se agregó `enableIndexedDbPersistence(db)` para permitir persistencia local de Firestore cuando el navegador lo soporte. Si no está disponible, la app continúa funcionando sin bloquear el arranque.

## Archivos modificados

- `index.html`
- `app.js`
- `styles.css`
- `firebase-config.js`
- `service-worker.js`

## QA estático ejecutado

- `node --check app.js`
- validación JSON de `manifest.webmanifest`;
- validación JSON de `lineas_catalog.json`;
- validación de IDs usados en JavaScript contra elementos HTML;
- validación de `data-view` contra secciones reales;
- validación de ZIP final.

