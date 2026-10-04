# Inventario Doméstico

App web para llevar inventarios del hogar, compartirlos con otras personas y recibir avisos cuando algo se acaba. React + TypeScript + Vite + Tailwind + Supabase (Postgres, Auth, Realtime, RLS, Storage) + Netlify (hosting y Functions) + Resend (correos).

## Puesta en marcha

### 1. Supabase

Crea un proyecto en supabase.com. En el SQL Editor ejecuta, en este orden, el contenido completo de:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_storage.sql`

Luego, en Authentication:

- URL Configuration > Site URL: la URL final de tu sitio en Netlify (por ejemplo `https://mi-inventario.netlify.app`).
- URL Configuration > Redirect URLs: agrega `https://tu-sitio/**` y `http://localhost:5173/**` para desarrollo. El restablecimiento de contraseña vuelve a `/restablecer`.
- Providers > Email: deja activo email + contraseña. Si dejas activa la confirmación de correo, quien se registre debe confirmar antes de entrar (la app lo avisa). Para probar rápido puedes desactivarla.

Las claves están en Project Settings > API: `Project URL`, `anon public` y `service_role`.

### 2. Variables de entorno

Copia `.env.example` a `.env` para desarrollo local (solo las dos variables `VITE_*`). En Netlify (Site configuration > Environment variables) configura todas:

| Variable | Dónde se usa | Notas |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | navegador y funciones | pública |
| `VITE_SUPABASE_ANON_KEY` | navegador y funciones | pública, la seguridad la dan las políticas RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | solo función programada | secreta, nunca con prefijo `VITE_` |
| `RESEND_API_KEY` | solo funciones | secreta |
| `EMAIL_FROM` | solo funciones | remitente verificado, ej. `Inventario <avisos@tudominio.cl>` |
| `APP_URL` | solo funciones | URL pública para los enlaces de los correos; si falta se usa la `URL` que Netlify entrega |

La clave de Resend y la service role nunca llegan al navegador. Los enlaces de los correos se arman con `APP_URL`, jamás con datos enviados por el cliente.

### 3. Resend

Crea una cuenta, verifica tu dominio (registros DNS SPF y DKIM) y genera una API key. Sin dominio verificado Resend solo permite enviar a tu propio correo, así que las invitaciones y alertas a otras personas no llegarán. Mientras no haya `RESEND_API_KEY` la app sigue funcionando: la invitación queda creada y se puede compartir copiando el enlace, y las alertas simplemente no se envían.

### 4. Netlify

Conecta el repositorio. `netlify.toml` ya define build (`npm run build`), carpeta `dist`, funciones en `netlify/functions`, Node 22, redirección SPA (`/*` a `/index.html`), cabeceras de seguridad y caché. Con Netlify CLI puedes probar local con `netlify dev`.

La función programada `process-alerts` corre cada 5 minutos. Netlify ejecuta funciones programadas solo en el deploy publicado de producción, no en previews ni en `netlify dev` (ahí puedes invocarla a mano con `netlify functions:invoke process-alerts`).

### 5. Desarrollo local

```
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # app + funciones
npm run build
npm run test:db      # pruebas SQL (Linux con Postgres local y usuario postgres, ver supabase/tests/run.sh)
```

## Cómo funciona

Cada inventario es independiente: sus ubicaciones, categorías, subcategorías, unidades, productos, lista de compras, historial, alertas y colaboradores. El acceso se decide por completo en Postgres con RLS: el propietario y los miembros (lector, editor, administrador) ven solo lo suyo, y las columnas editables se limitan con GRANT por columna. Los cambios de cantidad pasan por la función atómica `adjust_product_quantity`, que bloquea la fila, valida el rol, escribe el historial y evita que dos personas se pisen. Si la otra persona llegó antes, la suma es sobre el valor real, no sobre el que veías.

El indicador "ACTUALIZADO AHORA / HACE X MIN" usa el reloj del servidor (`server_now()`) y no el del teléfono. Los cambios llegan a las demás personas por Realtime; al volver a la pestaña o recuperar internet se recarga todo, porque Realtime no entrega bien los DELETE filtrados.

Alertas diferidas: cuando un producto queda bajo el mínimo o agotado se crea una alerta pendiente en la base. La función programada, no el navegador, revisa cada 5 minutos, descarta las alertas cuyo stock se recuperó, y envía un solo correo por persona e inventario (agrupado por producto) cuando se cumple el tiempo de espera (30 minutos por defecto, configurable por persona e inventario). Cada envío usa una llave de idempotencia, así que un reintento no duplica correos.

Invitaciones: el token se guarda hasheado, expira y se puede revocar. El enlace completo solo se muestra al crearlo. Quien lo abre ve el inventario, el propietario, la descripción y el rol antes de aceptar o rechazar, y si la cuenta no coincide con el correo invitado se bloquea.

Las fotos de productos van a un bucket privado de Storage con URLs firmadas, y solo las ve quien es miembro del inventario.

## Verificación realizada

Se probó contra un Postgres 16 real con las migraciones aplicadas, PostgREST real, un navegador Chromium automatizado (Playwright) y un servidor simulado de Auth, Storage y Realtime. Resultado: 58 pasos de extremo a extremo sin fallas (registro, onboarding, +/- y cantidad manual, historial, lista de compras automática, alertas diferidas con y sin recuperación de stock, invitaciones por enlace y por correo, roles, revocación en vivo, importación y exportación CSV, modo sin conexión) y todas las pruebas SQL de RLS y lógica. Typecheck y build limpios.

## Limitaciones

Esto es lo que no pude comprobar o que no existe, dicho sin adornos:

- No se probó contra Supabase Cloud, Resend ni un deploy real en Netlify. Auth, Realtime y Storage se simularon con un servidor falso que respeta el contrato de la API, pero el primer despliegue real puede mostrar diferencias de configuración. El simulador de Realtime no aplica RLS, así que ese filtrado en vivo depende de que Supabase se comporte como documenta.
- No hay cola de cambios sin conexión. Sin internet, tocar +/- muestra un error y revierte el valor. El indicador pasa a "Sin conexión" y todo se recarga al volver la red.
- Las notificaciones del navegador son locales (se muestran con la app abierta). No es Web Push real con la app cerrada, que requiere claves VAPID y un servicio adicional.
- Las alertas por correo tienen granularidad de unos 5 minutos y dependen de que la función programada esté activa en producción con `SUPABASE_SERVICE_ROLE_KEY` y `RESEND_API_KEY`.
- El enlace de invitación solo se ve al crearlo; después hay que revocar y generar otro.
- La PWA es instalable y cachea el shell de la app, pero no guarda datos para uso sin conexión.

## Revisión de la lista de 32 puntos

Marcados como verificados en pruebas automáticas: múltiples inventarios independientes, propietario y roles con RLS, invitación por correo y por enlace con aceptar y rechazar, expiración y revocación, selector global, ubicaciones, categorías y subcategorías personalizadas con reubicación o borrado de productos, productos y unidades propios, estados de stock por color, +/- y cantidad manual con guardado inmediato, indicador de sincronización, tiempo real entre usuarias, lista de compras automática y manual, alertas diferidas sin duplicados y canceladas si se recupera el stock, notificaciones internas, vencimientos, historial con filtros, búsqueda y filtros, preferencias de notificación por persona e inventario, onboarding vacío o con ejemplo removible, exportar e importar CSV, tema oscuro, y duplicar y confirmar borrados.

Implementados pero sin prueba automática profunda: instalación como PWA en un dispositivo real y la apariencia en dispositivos físicos (se revisó en viewport móvil, tablet y escritorio).

No verificados por falta de acceso: envío real con Resend, Realtime y Auth de Supabase Cloud, y el cron de Netlify en producción.

## Estructura

```
src/components   UI, inventario, sincronización, layout
src/pages        Inicio, Inventario, Compras, Alertas, Configuración, Invitación, Onboarding
src/hooks        hooks reutilizables
src/lib          cliente Supabase, constantes, reglas de stock, errores
src/services     acceso a datos por dominio
src/contexts     auth, inventarios, datos del inventario, toasts
src/utils        fechas y utilidades
src/types        tipos de la base
netlify/functions send-invitation, process-alerts
supabase         migraciones y pruebas SQL
```
