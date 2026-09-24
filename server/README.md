# Texas multijugador: infraestructura gratuita

La web permanece en GitHub Pages. Cloudflare solo aloja la API del multijugador en un subdominio `workers.dev`. Este Worker usa un Durable Object para el directorio y otro por cada mesa, ambos con almacenamiento SQLite. La comunicación de presencia usa WebSockets hibernables. El protocolo HTTP/WebSocket no depende de React y podrá reutilizarse desde Android o iPhone. No se requieren Pages, R2, D1, dominios propios ni servicios de pago de Cloudflare.

## Primera conexión con Cloudflare

1. Comprueba en el panel de Cloudflare que la cuenta sigue en el plan **Free**. Si Cloudflare pide contratar o añadir un método de pago para cualquiera de estos pasos, detente y no aceptes.
2. Abre una terminal normal en la carpeta del proyecto y ejecuta `npm ci`. La herramienta Wrangler ya está declarada en `package.json`.
3. Ejecuta `npx wrangler login --device --use-keyring`. Wrangler mostrará una dirección de Cloudflare y un código temporal. Abre esa dirección, inicia sesión en tu propia cuenta y autoriza Wrangler. La opción `--use-keyring` guarda la clave en el Administrador de credenciales de Windows (puede instalar un pequeño componente de npm la primera vez). No envíes tu contraseña, código ni token por chat y no los guardes en el repositorio. Si el código caduca, ejecuta el comando de nuevo. La autorización queda en el equipo, fuera del proyecto.
4. Comprueba la cuenta con `npx wrangler whoami`. Si tienes más de una cuenta de Cloudflare, confirma que Wrangler ha elegido la cuenta gratuita correcta antes de desplegar.
5. Ejecuta `npm run multiplayer:deploy`. El primer despliegue crea el Worker `pumpoker-texas-multiplayer`, sus dos clases Durable Object SQLite y la ruta `https://pumpoker-texas-multiplayer.<tu-subdominio>.workers.dev`. No hace falta crear Durable Objects a mano. Si Cloudflare solicita elegir un subdominio `workers.dev`, usa uno gratuito; no cambies los DNS ni GitHub Pages.
6. Abre `https://pumpoker-texas-multiplayer.<tu-subdominio>.workers.dev/api/health`. Debe responder `{"ok":true,"service":"texas-multiplayer"}`. Conserva la URL base, sin `/api/health` y sin barra final.
7. En el repositorio de GitHub, ve a **Settings → Secrets and variables → Actions → Variables → New repository variable**. Crea `MULTIPLAYER_API_URL` con esa URL base HTTPS. Es una URL pública, no un secreto. El flujo de GitHub Pages ya la pasa a Vite durante la compilación; si la variable está vacía, el modo individual sigue igual y la web publicada muestra que el servidor multijugador no está conectado.
8. Sube los archivos de esta fase al repositorio y deja que el flujo **Publicar en GitHub Pages** termine. El alojamiento continúa siendo GitHub Pages. Abre la web desde dos dispositivos: en uno crea una sala y en el otro entra, comprueba la presencia y envía un mensaje de chat. Una sala privada exige tanto código como contraseña.

No conectes la web publicada a `http://127.0.0.1:8787`: esa dirección solo sirve en el propio equipo y no funcionará desde otros móviles. El despliegue de Cloudflare no sube automáticamente los cambios del frontend a GitHub.

## Probar en local

1. `npm ci`
2. `npm run multiplayer:dev` (servidor en `http://127.0.0.1:8787`)
3. En otra terminal, `npm run dev` o `npm run preview` (web)
4. Abrir dos navegadores y crear/entrar en una mesa de Texas.

La web en `localhost` o `127.0.0.1` usa automáticamente el servidor local. Para la web publicada, la variable de GitHub `MULTIPLAYER_API_URL` se convierte en `VITE_MULTIPLAYER_API_URL` durante la compilación; no se guarda ningún secreto en esa variable. Ajustar `ALLOWED_ORIGINS` en `wrangler.jsonc` si cambia el dominio de la web.

En esta fase se pueden crear mesas públicas o privadas, listarlas, entrar, salir y ver presencia. Cada sala tiene un código de invitación; si es privada, el código no sustituye a la contraseña. También se puede elegir cuántos asientos se reservarán a personas y bots (máximo nueve en total) y el tiempo futuro por turno (6, 15 o 30 segundos). Hay un chat de mesa por WebSocket: los mensajes se difunden a las conexiones actuales, se limitan a 200 caracteres y no se guardan ni se recuperan al reconectar. Las contraseñas privadas se derivan con sal y nunca aparecen en la lista. Los asientos desconectados se reservan cinco minutos para reconectar. Las mesas sin actividad expiran del listado a las 24 horas.

**Aún no hay reparto, bots activos, reloj de acciones ni apuestas multijugador.** La lógica actual de Texas sigue siendo local para un jugador; antes de activar una partida entre humanos hay que trasladar el estado de la mano y la validación de acciones al Durable Object, resolver el vencimiento del turno allí y emitir a cada jugador únicamente sus cartas propias y la información pública. La mesa visual existente debe reutilizarse entonces; no conectar la partida local como si fuera compartida. No publicar esta fase como juego multijugador terminado.
