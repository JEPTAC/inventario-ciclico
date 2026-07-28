# Cambios V37 · Histórico nuevo en borrador

## Objetivo
A partir de la nueva metodología de carga local del Excel SIESA, la app debe crear un histórico nuevo para evitar repetir referencias ya contadas, sin usar el histórico viejo de Drive/SIESA como base de exclusión.

## Decisión funcional
- La base diaria del Excel se sigue reiniciando con cada carga.
- El histórico antiguo `referenceMemory` no se usa para bloquear referencias cuando la carga local viene con reinicio de ciclo.
- Se crea un histórico nuevo independiente en `referenceMemoryV2`.
- Mientras el proyecto esté en pruebas, ese histórico corre en modo `draft` / borrador.
- En borrador, las referencias contadas desde la nueva metodología sí se bloquean para no repetirse durante pruebas.
- En borrador, la app no actualiza el histórico oficial antiguo `referenceMemory`.
- Cuando se active el modo oficial, los nuevos conteos también alimentarán `referenceMemory`.

## Nuevas estructuras Firestore

### `syncState/inventoryHistoryControl`
Controla el estado del histórico nuevo.

Campos principales:
- `mode`: `draft` u `official`.
- `historyStatus`: `draft` u `official`.
- `methodVersion`: `local_excel_v2`.
- `draftStartedDate`: fecha desde la que corre el histórico borrador.
- `officialStartedDate`: fecha desde la que corre el histórico oficial, cuando se active.

### `referenceMemoryV2/{referencia}`
Nuevo histórico por referencia para la metodología local.

Guarda:
- referencia
- última fecha de conteo
- cantidad sistema
- cantidad física
- diferencia
- usuario
- rol
- duración
- estado `draft` u `official`
- versión `local_excel_v2`

## Cambios de lógica

### Carga diaria Excel local
Al procesar el Excel:
1. Se reconstruye la base operativa del día.
2. Se reemplazan tareas/reconteos abiertos pendientes.
3. Se consulta `referenceMemoryV2`.
4. Si una referencia ya fue contada en el histórico nuevo, queda marcada como contada para el año actual y no se repite.
5. Si no existe en `referenceMemoryV2`, queda disponible para programación.

### Conteo desde celular / bodega
Al guardar un conteo:
1. Se guarda el conteo normal en `counts`.
2. Se actualiza `referenceMemoryV2`.
3. Si el modo está en `draft`, no se actualiza `referenceMemory` oficial.
4. Si el modo está en `official`, también se actualiza `referenceMemory`.

### Activación futura
Se agregó botón en Carga Excel SIESA:
- `Activar histórico oficial desde hoy`

Al activarlo:
- cambia `syncState/inventoryHistoryControl.mode` a `official`.
- define `officialStartedDate` con la fecha del día.
- desde ese momento los conteos del nuevo método alimentan el histórico oficial.

## Reglas Firestore
Se agregaron permisos para:
- `referenceMemory`
- `referenceMemoryV2`

Lectura: usuarios activos.  
Creación/actualización: inventario, jefe logístico, auditoría y super admin.  
Eliminación: solo super admin.
