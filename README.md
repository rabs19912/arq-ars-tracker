# Arq USDC/ARS Tracker

Aplicación Next.js que guarda la cotización USDC/ARS de [Arq Finance](https://api.arqfinance.com/v1/tickers?currencies=ARS) cada 30 minutos en una base de datos Postgres (Neon) y muestra el historial en una página web. Pensada para correr gratis en Vercel Hobby + Neon Free.

## Qué hace

- Consulta `GET https://api.arqfinance.com/v1/tickers?currencies=ARS` y guarda todos los pares devueltos (`book`, `bid`, `ask`, `date`).
- Los precios se guardan como `NUMERIC(20,10)` sin conversión a float. La fecha de Arq (UTC sin zona horaria) se guarda como `TIMESTAMPTZ`.
- La página `/` muestra el último ask, el último bid, la fecha del último guardado y una tabla con las últimas 200 cotizaciones (con spread porcentual). Las fechas se muestran en hora de Buenos Aires.

## Endpoints

| Endpoint | Descripción |
| --- | --- |
| `GET /api/cron` | Obtiene la cotización de Arq y la guarda. Requiere `Authorization: Bearer <CRON_SECRET>`; de lo contrario responde 401. Devuelve `{ ok: true, saved: [...] }`. |
| `GET /api/quotes?limit=100` | Historial ordenado por `saved_at` descendente. Por defecto 100, máximo 1000 (valores inválidos se ajustan al rango 1 a 1000). Si la tabla no existe devuelve una lista vacía. |

## Configuración local

```bash
npm install
cp .env.example .env.local   # completa DATABASE_URL y CRON_SECRET
npm run db:init              # crea la tabla y el índice
npm run dev
```

Genera el secreto con `openssl rand -hex 32`. Para probar el guardado manualmente:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron
```

Para simular el polling cada 30 minutos en local (con `npm run dev` corriendo en otra terminal):

```bash
npm run poll
```

## Despliegue gratuito paso a paso

### 1. Neon Free

1. Crea una cuenta y un proyecto en [Neon](https://neon.tech) (plan Free).
2. Copia la cadena de conexión **pooled** (host con `-pooler`) y guárdala como `DATABASE_URL`.
3. Opcional: ejecuta `npm run db:init` localmente con esa URL. Si no lo haces, la tabla se crea automáticamente en la primera ejecución de `/api/cron`.

### 2. Vercel Hobby

1. Importa el repositorio en [Vercel](https://vercel.com) (plan Hobby).
2. Define las variables de entorno `DATABASE_URL` y `CRON_SECRET`.
3. Despliega y anota la URL (`https://<tu-app>.vercel.app`).

### 3. Polling cada 30 minutos

**Opción recomendada: cron-job.org**

1. Crea una cuenta gratuita en [cron-job.org](https://cron-job.org) y un nuevo cron job.
2. URL: `https://<tu-app>.vercel.app/api/cron`.
3. Frecuencia: cada 30 minutos.
4. En *Advanced* agrega el header `Authorization` con valor `Bearer <CRON_SECRET>`.

**Alternativa: GitHub Actions**

El workflow `.github/workflows/poll.yml` llama al endpoint cada 30 minutos. Configura estos secretos en el repositorio (Settings > Secrets and variables > Actions):

- `APP_URL`: URL de la app **sin** barra final (por ejemplo `https://<tu-app>.vercel.app`).
- `CRON_SECRET`: el mismo valor configurado en Vercel.

Ten en cuenta que las ejecuciones programadas de GitHub pueden retrasarse, y que se desactivan después de 60 días de inactividad en el repositorio.

### Por qué no hay crons en `vercel.json`

El plan Hobby de Vercel solo permite crons diarios, por lo que no sirven para una frecuencia de 30 minutos. Por eso el proyecto no incluye `vercel.json` y delega el disparo a un servicio externo (cron-job.org o GitHub Actions).
