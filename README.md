# Inventario Cíclico SIESA - Firebase + Drive v13 v12

Aplicación web estática para GitHub Pages con Firebase Authentication, Firestore y lectura del Excel diario `Excel_siesa.xls` desde Google Drive.

## Configuración incluida

```js
clientId: "125993982318-gn2177d3muf2iip0co9pf9mii7d12cre.apps.googleusercontent.com"
folderId: "1Njl9epGdr68LtlOzq3N0QcnXpcOZVFmQ"
fileName: "Excel_siesa.xls"
sheetName: "Sheet1"
```

Firebase: `inventario-ciclico-f53a3`.

## Roles

- `super_admin`: acceso total, creación de usuarios y todos los módulos.
- `inventario`: solo registra conteos asignados y metraje asignado.
- `jefe_logistico`: sincroniza SIESA, genera tareas, aprueba conteos, valida novedades y escala a auditoría.
- `auditoria`: contabiliza independientemente casos escalados, agrega comentarios por referencia y envía a gerencia.
- `gerencia`: revisa informe, aprueba cierre o autoriza ajuste.

## Módulo general de inventario cíclico

- Frecuencias ABC: 10, 20, 30, 60, 90 y 120 jornadas.
- El Pareto se calcula con valor, costo, movimiento y variabilidad.
- El objetivo es distribuir el conteo durante el año sin repetir referencias antes de vencimiento.
- Si hay diferencia, se genera reconteo; si persiste, pasa a jefe logístico.
- Si jefe logístico no justifica, escala a auditoría.
- Auditoría agrega comentarios y contabilización independiente por referencia.
- Gerencia aprueba o autoriza ajuste final.

## Módulo independiente de metraje de cables

Este módulo queda separado del inventario cíclico general.

Reglas principales:

- Solo aplica a materiales identificados como cables desde el Excel.
- Se habilita por sesión cada 15 días.
- La selección es aleatoria, sin criticidad ni Pareto.
- Calcula cuántos cables debe tomar en cada sesión para llegar al 100% antes del 31 de diciembre.
- Si un cable fue contado en metraje durante el año actual, no vuelve a entrar hasta el siguiente año.
- Si un cable es recién ingresado o recién cortado, queda en maduración y no entra al sorteo hasta cumplir el tiempo configurado.
- La maduración por defecto es de 15 días, configurable en el panel de parámetros.

## Sincronización automática

La app intenta sincronizar a las 8:00 a.m. cuando está abierta con usuario `super_admin` o `jefe_logistico` y Drive autorizado.

Si se requiere actualización automática aunque nadie abra la app, se necesita Apps Script o Cloud Function programada.

## Firebase Authentication

Activa Email/Password y crea el primer usuario. Luego en Firestore crea:

```json
{
  "displayName": "Super Admin",
  "email": "tu_correo@empresa.com",
  "role": "super_admin",
  "active": true
}
```

Ruta:

```text
users/{uid}
```

## Reglas de Firestore

Publica el archivo `firestore.rules`.

## GitHub Pages

Sube a la raíz del repositorio:

```text
index.html
styles.css
app.js
firebase-config.js
firestore.rules
README.md
```

En Google Cloud agrega el origen autorizado:

```text
https://TU-USUARIO.github.io
```

Para prueba local con Live Server:

```text
http://localhost:5500
http://127.0.0.1:5500
```


## Corrección v13

- El token de Drive ahora se valida antes de buscar el Excel.
- Si Drive devuelve 401, la app limpia el token y pide reconectar Drive.
- La sincronización no se dispara varias veces en paralelo.
- La sincronización automática de las 8:00 a.m. no abre popups; solo verifica tareas si Drive ya fue conectado manualmente.
- La agenda diaria exige materiales por contar cuando ya existe base SIESA en Firestore.


## Corrección v14

- Si el panel de inventario aparece vacío, el jefe logístico o super admin puede crear tareas obligatorias del día.
- Después de sincronizar SIESA, la app intenta completar automáticamente la agenda diaria.
- Si no hay materiales vencidos, usa selección aleatoria ponderada por Pareto para garantizar conteo diario.
- No toma materiales con movimiento reciente hasta cumplir días de maduración.
- La colección que debe revisarse si no aparecen tareas es `countTasks`.


## Versión v15 - Conteo diario por Pareto anual

Cambio de lógica principal:

- El conteo general ya no depende principalmente de vencidos.
- Todos los días debe existir una agenda de conteo.
- La selección diaria se hace por Pareto aleatorio sin repetición anual.
- La app evita repetir materiales hasta completar la cobertura anual.
- Si por operación ya no hay materiales pendientes elegibles, permite repetición controlada por Pareto.
- Los materiales recién movidos entran en maduración y no se priorizan de inmediato.
- La meta diaria se calcula con: pendientes del año / días activos restantes hasta 31 de diciembre.
- El módulo de indicadores mide cobertura anual, cobertura de metraje, meta diaria, diferencias, exactitud y casos abiertos.

## Metraje de cables

- Módulo separado.
- Se activa por sesiones cada 15 días.
- Selección aleatoria, sin criticidad.
- Evita repetir cables hasta cubrir el 100% anual.
- Excluye cables recién ingresados o cortados hasta cumplir maduración.
- Calcula cables por sesión con: cables pendientes del año / sesiones restantes hasta 31 de diciembre.


## Versión v16 - Corrección de ejecución

- Corrige el error `isActiveCountingDay is not defined`.
- Agrega alias internos para compatibilidad con la agenda anual.
- No requiere cambiar reglas de Firestore frente a la v15.
- Después de subir esta versión, recargar con Ctrl + F5.


## Versión v17 - Regla definitiva de conteo diario

Esta versión elimina la dependencia operativa de los vencimientos para la agenda diaria.

Regla general:

- Todos los días debe haber conteo.
- La agenda diaria se genera por Pareto aleatorio sin repetición anual.
- No se repiten materiales hasta cubrir el 100% del año.
- Si se termina la cobertura anual antes del 31 de diciembre, se habilita repetición controlada por Pareto.
- Los materiales con movimiento reciente se dejan en maduración, salvo que no haya más materiales disponibles.
- El botón `Generar conteo obligatorio` llama directamente a la agenda anual por Pareto.
- Después de sincronizar SIESA también se crea/verifica la agenda obligatoria.

Colección principal de tareas:
`countTasks`

Campo clave:
`taskType = conteo_diario_pareto`


## Versión v18 - Revisión exhaustiva de la lógica

Cambio estructural:

- Se elimina la agenda operativa por vencimientos.
- `nextDueDate` y `frequency` ya no controlan el conteo diario.
- El conteo general se crea todos los días por calendario anual.
- Calendario general: lunes a viernes hasta el 31 de diciembre.
- Fórmula: materiales pendientes del año / días hábiles restantes.
- Selección: aleatoria ponderada por Pareto, con costo, valor, movimiento y variabilidad.
- No se repite un material hasta que el 100% anual esté cubierto.
- Material nuevo después de la base inicial se marca automáticamente como contado/verificado por ingreso.
- En primera sincronización no se auto-cuenta toda la base: se crea agenda obligatoria del día.
- El panel Inventario muestra `countTasks` con `taskType = conteo_diario_pareto`.
- Metraje de cables: módulo separado, cada 15 días, selección aleatoria pura, sin Pareto ni criticidad.


## Versión v19 - Corrección de bloqueo de carga

Corrige el error:

`Uncaught SyntaxError: Identifier 'forceCableMeterTasks' has already been declared`

Causa:
En la v18 quedaron dos funciones `forceCableMeterTasks`. El navegador detiene todo el archivo `app.js`, por eso la pantalla se queda pegada en "Inicializando aplicación...".

Corrección:
Se eliminó la función duplicada antigua y se conserva la versión nueva del módulo de metraje anual por sesión cada 15 días.


## Versión v20 - Corrección de registro de conteo

Corrige el error:

`ReferenceError: saveCount is not defined`

Causa:
La v19 tenía el formulario conectado a `saveCount`, pero la función no estaba declarada.

Corrección:
- Se restauró `saveCount`.
- Se conserva `openTaskCountDialog`.
- El conteo exacto queda pendiente de aprobación del jefe logístico.
- Si hay diferencia, genera reconteo.
- Si persiste la diferencia, escala a jefe logístico.
- También permite registrar conteos desde casos de jefe logístico o auditoría.


## Versión v21 - Estabilidad de arranque Firebase

Validaciones hechas antes de empaquetar:

- `node --check app.js`: OK.
- Funciones duplicadas: 0.
- Funciones críticas presentes: `init`, `setupEvents`, `loadProfile`, `loadSettings`, `refreshAll`, `syncFromDrive`, `forceMandatoryDailyTasks`, `forceCableMeterTasks`, `saveCount`.
- El arranque ya no se queda pegado silenciosamente: muestra error visible en la tarjeta de inicialización.
- `refreshAll()` carga colecciones de forma segura; si una colección falla por reglas, la app no queda bloqueada completa.
- Se agregó diagnóstico en consola: `firebaseHealthCheck()`.

Uso del diagnóstico:
1. Abrir consola.
2. Escribir `await firebaseHealthCheck()`.
3. Revisar si `settingsReadable`, `materialsReadable` y `tasksReadable` son true.
