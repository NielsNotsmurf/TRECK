// Worker met statische assets uit public/; alleen /api/* komt hier binnen.
import * as analyze from './analyze.js';
import * as items from './items.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.headers.get('x-key') !== env.APP_SECRET) return new Response('Geen toegang', { status: 401 });
    const ctx = { request, env };
    if (url.pathname === '/api/analyze' && request.method === 'POST') return analyze.onRequestPost(ctx);
    if (url.pathname === '/api/items' && request.method === 'GET') return items.onRequestGet(ctx);
    if (url.pathname === '/api/items' && request.method === 'DELETE') return items.onRequestDelete(ctx);
    return new Response('Niet gevonden', { status: 404 });
  },
};
