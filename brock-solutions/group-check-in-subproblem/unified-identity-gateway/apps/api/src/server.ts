import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { flightRoutes } from './routes/flights';
import { passengerRoutes } from './routes/passengers';
import { documentRoutes } from './routes/document';
import { seatRoutes } from './routes/seat';
import { bagRoutes } from './routes/bags';
import { boardingPassRoutes } from './routes/boardingPass';
import { overrideRoutes } from './routes/override';

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(flightRoutes);
  app.register(passengerRoutes);
  app.register(documentRoutes);
  app.register(seatRoutes);
  app.register(bagRoutes);
  app.register(boardingPassRoutes);
  app.register(overrideRoutes);

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  const port = Number(process.env.PORT) || 3001;
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
