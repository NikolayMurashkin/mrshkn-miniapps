import { createServer, type IncomingMessage } from 'node:http';
import { SINK_PORT } from './consts.ts';
import type { SinkCall } from './types.ts';

/** Заглушка ботов Telegram и MAX: пишет сообщения, которые приложение шлет клиентам и владельцу, и отдает журнал. */
const calls: SinkCall[] = [];

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${SINK_PORT}`);

  if (request.method === 'GET' && url.pathname === '/calls') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(calls));

    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/calls') {
    calls.length = 0;
    response.writeHead(204);
    response.end();

    return;
  }

  const isTelegram = url.pathname.startsWith('/telegram/');
  const isMax = url.pathname.startsWith('/max/');

  if (request.method === 'POST' && (isTelegram || isMax)) {
    calls.push({
      channel: isTelegram ? 'telegram' : 'max',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: await readBody(request),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(isTelegram ? { ok: true, result: { message_id: calls.length } } : { ok: true }));

    return;
  }

  response.writeHead(404);
  response.end();
}).listen(SINK_PORT);
