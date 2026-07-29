# Solución V38 - Permisos referenceMemoryV2

## Error detectado

En consola aparece:

```txt
FirebaseError: Missing or insufficient permissions.
loadReferenceMemoryV2Map
```

La causa es que la app ya intenta leer la nueva colección `referenceMemoryV2`, pero las reglas publicadas en Firebase todavía no tienen permiso para esa colección.

## Qué se corrigió en la V38

1. La app ya no queda sin histórico nuevo si Firestore bloquea `referenceMemoryV2`.
2. Mientras se publican las reglas, usa un respaldo local temporal en el navegador/celular.
3. Muestra aviso visible cuando el histórico está funcionando solo en modo local.
4. El archivo `firestore.rules` incluido en este ZIP ya contiene el bloque requerido para `referenceMemoryV2`.

## Importante

El respaldo local solo sirve para pruebas en el mismo navegador/celular. Para que el histórico funcione entre varios celulares, se deben publicar las reglas en Firebase.

## Regla requerida

Dentro de `service cloud.firestore`, debe existir este bloque:

```js
match /referenceMemoryV2/{memoryId} {
  allow read: if active();
  allow create, update: if hasAnyRole(["inventario", "jefe_logistico", "auditoria"]);
  allow delete: if superAdmin();
}
```

## Cómo publicarlo

Opción 1, desde Firebase Console:

1. Entrar a Firebase Console.
2. Ir a Firestore Database.
3. Abrir la pestaña Rules / Reglas.
4. Pegar las reglas completas del archivo `firestore.rules`.
5. Presionar Publish / Publicar.

Opción 2, desde terminal con Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

## Mensajes de consola que no son críticos

Estos mensajes no bloquean la app:

```txt
enableIndexedDbPersistence() will be deprecated
```

Es solo una advertencia de Firebase. La persistencia offline actual sigue funcionando.

```txt
Service Worker registrado
```

Esto está bien. Significa que la PWA quedó registrada.

```txt
Banner not shown: beforeinstallpromptevent.preventDefault()
```

No es error operativo. Solo indica que el banner de instalación PWA no se mostró automáticamente.
