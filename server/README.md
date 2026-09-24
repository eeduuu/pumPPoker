# Texas multijugador: infraestructura gratuita

La web permanece en GitHub Pages. Cloudflare solo aloja la API del multijugador en un subdominio `workers.dev`. Este Worker usa un Durable Object para el directorio y otro por cada mesa, ambos con almacenamiento SQLite. La comunicación de presencia usa WebSockets hibernables. El protocolo HTTP/WebSocket no depende de React y podrá reutilizarse desde Android o iPhone. No se requieren Pages, R2, D1, dominios propios ni servicios de pago de Cloudflare.

## Primera conexión con Cloudflare

1. Comprueba en el panel de Cloudflare que la cuenta sigue en el plan **Free**. Si Cloudflare pide contratar o añadir un método de pago para cualquiera de estos pasos, detente y no aceptes.
2. Abre una terminal normal en la carpeta del proyecto y ejecuta `npm ci`. La herramienta Wrangler ya está declarada en `package.json`.
3. Ejecuta `npx wrangler login --device --use-keyring`. Wrangler mostrará una dirección de Cloudflare y un código temporal. Abre esa dirección, inicia sesión en tu propia cuenta y autoriza Wrangler. La opción `--use-keyring` guarda la clave en el Administrador de credenciales de Windows (puede instalar un pequeño componente de npm la primera vez). No envíes tu contraseña, código ni token por chat y no los guardes en el repositorio. Si el código caduca, ejecuta el comando de nuevo. La autorización queda en el equipo, fuera del proyecto.
4. Comprueba la cuenta con `npx wrangler whoami`. Si tienes más de una cuenta de Cloudflare, confirma que Wrangler ha elegido la cuenta gratuita correcta antes de desplegar.
5. Ejecuta `npm run multiplayer:deploy`. El primer despliegue crea el Worker `pumpoker-texas-multiplayer`, sus dos clases Durable Object SQLite y la ruta `https://pumpoker-texas-multiplayer.<tu-subdominio>.workers.dev`. No hace falta crear Durable Objects a mano. Si Cloudflare solicita elegir un subdominio `workers.dev`, usa uno gratuito; no cambies los DNS ni GitHub Pages.
6. Abre `https://pumpoker-texas-multiplayer.<tu-subdominio>.workers.dev/api/health`. Debe responder `{"ok":true,"service":"texas-multiplayer"}`. Conserva la URL base, sin `/api/health` y sin barra final.
7. El flujo de GitHub Pages usa la URL `workers.dev` desplegada para esta cuenta. Si cambia el subdominio, crea o actualiza la variable de repositorio `MULTIPLAYER_API_URL` con la nueva URL base HTTPS, sin barra final. Es una URL pública, no un secreto.
8. Sube los archivos de esta fase al repositorio y deja que el flujo **Publicar en GitHub Pages** termine. El alojamiento continúa siendo GitHub Pages. Abre la web desde dos dispositivos: en uno crea una sala y en el otro entra, comprueba que ambos ven la misma mano y que las cartas privadas no se muestran al rival. Una sala privada exige tanto código como contraseña.

No conectes la web publicada a `http://127.0.0.1:8787`: esa dirección solo sirve en el propio equipo y no funcionará desde otros móviles. El despliegue de Cloudflare no sube automáticamente los cambios del frontend a GitHub.

## Probar en local

1. `npm ci`
2. `npm run multiplayer:dev` (servidor en `http://127.0.0.1:8787`)
3. En otra terminal, `npm run dev` o `npm run preview` (web)
4. Abrir dos navegadores y crear/entrar en una mesa de Texas.

La web en `localhost` o `127.0.0.1` usa automáticamente el servidor local. Para la web publicada, la variable de GitHub `MULTIPLAYER_API_URL` se convierte en `VITE_MULTIPLAYER_API_URL` durante la compilación; no se guarda ningún secreto en esa variable. Ajustar `ALLOWED_ORIGINS` en `wrangler.jsonc` si cambia el dominio de la web.

En esta fase se pueden crear mesas públicas o privadas, listarlas, entrar, salir y ver presencia. Cada sala tiene un código para compartir; una sala pública sigue apareciendo en «Buscar mesa» mientras haya plazas humanas, incluso si la partida está en curso. Una sala privada exige contraseña además del código. Se pueden elegir plazas humanas y bots (máximo nueve asientos en total) y turnos de 6, 15 o 30 segundos. Si hay al menos un bot, se reparte al crear la sala; sin bots, se espera a la segunda persona. Quien entra con una mano en curso se incorpora en la siguiente. Las acciones y los vencimientos se resuelven en el Durable Object, que usa la misma baraja, reglas de apuestas, evaluación y decisiones de bots que Texas individual. Cada respuesta muestra cartas privadas solo a su dueño, excepto las manos no retiradas al resolver el bote. El chat se difunde a las conexiones actuales y no se guarda.

Por ahora la partida online usa una estructura normal de ciegas fijas 0,5/1 BB y 100 BB iniciales por asiento; las opciones avanzadas de torneo y descansos del modo individual todavía no están configurables en las salas online. El estado de una sala permanece en el Worker y el listado no publica cartas. Antes de considerar estable esta fase, probar dos móviles reales, reconexión y un ciclo completo de reparto y bote en Cloudflare.
