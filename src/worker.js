// Worker met statische assets uit public/; alleen /api/* komt hier binnen.
import * as analyze from './analyze.js';
import * as items from './items.js';
import * as auth from './auth.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    await auth.ensureSchema(env);
    if (route === 'GET /api/config') return Response.json({ googleClientId: env.GOOGLE_CLIENT_ID || null });
    if (route === 'POST /api/google') return auth.google({ request, env });
    if (route === 'POST /api/register') return auth.register({ request, env });
    if (route === 'POST /api/login') return auth.login({ request, env });

    const user = await auth.currentUser(request, env);
    if (!user) return new Response('Geen toegang', { status: 401 });
    const ctx = { request, env, user };
    if (route === 'POST /api/analyze') return analyze.onRequestPost(ctx);
    if (route === 'GET /api/items') return items.onRequestGet(ctx);
    if (route === 'DELETE /api/items') return items.onRequestDelete(ctx);
    if (user.admin && route === 'GET /api/pending') return auth.pending(ctx);
    if (user.admin && route === 'POST /api/decide') return auth.decide(ctx);
    return new Response('Niet gevonden', { status: 404 });
  },
  async scheduled(event, env) {
    await auth.ensureSchema(env);
    await analyze.retryQueue(env);
  },
};
