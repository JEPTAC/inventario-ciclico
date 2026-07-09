# QA aplicado - Inventario Cíclico SIESA

## 1. Diagnóstico general del proyecto

El proyecto es una aplicación web estática para GitHub Pages, basada en Firebase Authentication, Firestore, Google Drive, lectura de Excel SIESA con SheetJS, PWA y Service Worker. Tiene una estructura simple y correcta para despliegue estático:

- `index.html`: estructura de vistas, diálogos, botones, formularios y módulos por rol.
- `app.js`: lógica principal de autenticación, permisos, sincronización Drive/SIESA, tareas, conteos, casos, indicadores, metraje de cables y notificaciones.
- `firebase-config.js`: configuración Firebase, Drive y parámetros iniciales.
- `firestore.rules`: reglas de seguridad por rol.
- `styles.css`: diseño general, responsive y PWA móvil.
- `lineas_catalog.json`: catálogo de líneas y clasificación de cables.
- `manifest.webmanifest` y `service-worker.js`: instalación PWA y caché.

La base es buena, pero tenía fallos funcionales que podían hacer que módulos completos no trabajaran bien aunque visualmente existieran.

## 2. Hallazgos QA principales

### Crítico: catálogo de líneas no cargaba bien

En `loadLineCatalog()` se ejecutaba dos veces `res.json()`. Un `Response` solo puede leerse una vez; la segunda lectura genera error y el `catch` dejaba el catálogo vacío. Esto afectaba la identificación de líneas y cables.

Corrección aplicada: se dejó una sola lectura JSON.

### Alto: módulo Indicadores bloqueado

`index.html` tenía el botón y la vista `indicatorsView`, pero `VIEW_ACCESS` no lo incluía. Resultado: el botón se ocultaba o el usuario recibía mensaje de acceso denegado.

Corrección aplicada: se agregó `indicatorsView` a los roles autorizados.

### Alto: botones visibles sin funcionalidad

Los botones `Instalar APP`, `Activar alertas` y el cierre del diálogo de instalación existían en HTML, pero no tenían `addEventListener()`.

Corrección aplicada: se conectaron los eventos a `installApp()`, `enableAlerts()` y cierre del diálogo.

### Alto: reglas Firestore incompatibles con el flujo real

La app escribía `lastComment` al actualizar tareas desde inventario, pero las reglas solo permitían cambiar `status`, `lastCountId` y `updatedAt`. Además, cuando inventario detectaba diferencia, la app creaba una tarea de reconteo, pero las reglas solo permitían crear tareas a jefe logístico.

Corrección aplicada: se ajustaron las reglas para permitir `lastComment` y reconteos derivados con `previousTaskId` y `previousCountId`.

### Medio: accesos directos PWA no abrían módulos

El manifest tenía accesos como `?view=inventory`, pero la app siempre abría el panel general después del login.

Corrección aplicada: se agregó interpretación de `?view=` con alias en español e inglés.

### Medio: indicadores no se actualizaban en render general

`renderIndicators()` existía, pero no era llamado desde `renderAll()`.

Corrección aplicada: se agregó `renderIndicators()` y `renderDriveConfig()` dentro del render global.

### Bajo: duplicación de campos de foto

En el guardado de conteos de casos había propiedades `photoDriveId`, `photoDriveName`, `photoDriveUrl` y `photoDriveDownloadUrl` repetidas.

Corrección aplicada: se eliminaron las duplicadas.

### Bajo: favicon vacío

`favicon.ico` tenía 0 bytes, lo que podía generar comportamiento irregular en navegador/PWA.

Corrección aplicada: se generó un favicon válido desde los íconos existentes.

## 3. Mejoras de diseño aplicadas

Se agregó una capa visual v27 con:

- Mejor contraste azul institucional.
- KPIs con acento superior y mayor jerarquía visual.
- Navegación lateral con indicador activo.
- Cards más limpias y con fondo suavizado.
- Tablas con encabezado más legible.
- Mejor efecto hover en botones y filas.
- Mejor lectura móvil en barra inferior.
- Log técnico con contraste tipo consola.

## 4. Pruebas ejecutadas

- `node --check app.js`
- `node --check firebase-config.js`
- `node --check service-worker.js`
- Validación JSON de `lineas_catalog.json`
- Validación JSON de `manifest.webmanifest`
- Revisión de funciones duplicadas
- Revisión de botones HTML con ID contra referencias JavaScript
- Revisión de IDs JavaScript contra elementos existentes en HTML

Resultado: sin errores de sintaxis, sin funciones duplicadas y sin referencias HTML rotas detectadas en el análisis estático.

## 5. Pendientes que deben revisarse en entorno real

Estos puntos dependen de credenciales, permisos y datos reales:

- Inicio de sesión Firebase con usuario activo en `users/{uid}`.
- Publicación efectiva de `firestore.rules`.
- Permisos OAuth Drive del Client ID usado.
- Existencia y estructura real de `Excel_siesa.xls` en la carpeta Drive configurada.
- Índices Firestore si Firebase los solicita por combinaciones `where` + `orderBy`.
- Prueba real de carga de evidencia fotográfica en Drive.

## 6. Recomendación de despliegue

1. Subir todos los archivos del proyecto actualizado al repositorio de GitHub Pages.
2. Publicar `firestore.rules` en Firebase.
3. Abrir la app y hacer Ctrl + F5.
4. En celular, cerrar y volver a abrir la PWA o reinstalar si conserva caché viejo.
5. Probar con un usuario `super_admin` y luego con usuario `inventario`.
