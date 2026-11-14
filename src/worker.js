// Worker met statische assets uit public/; alleen /api/* komt hier binnen.
import * as analyze from './analyze.js';
import * as items from './items.js';
import * as auth from './auth.js';
import * as memory from './memory.js';
import * as push from './push.js';
import * as ai from './ai.js';
import * as insights from './insights.js';
import * as program from './program.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    await auth.ensureSchema(env);
    if (route === 'GET /api/config') return Response.json({ googleClientId: env.GOOGLE_CLIENT_ID || null });
    if (route === 'POST /api/google') return auth.google({ request, env });
    if (route === 'POST /api/register') return auth.register({ request, env });
    if (route === 'GET /api/pushmsg') return push.msg({ request, env });
    if (route === 'POST /api/login') return auth.login({ request, env });

    const user = await auth.currentUser(request, env);
    if (!user) return new Response('Geen toegang', { status: 401 });
    const ctx = { request, env, user };
    if (route === 'GET /api/ai') return ai.status(ctx);
    if (route === 'GET /api/stats') return insights.stats(ctx);
    if (route === 'POST /api/insight') return insights.summary(ctx);
    if (route === 'GET /api/program') return program.show(ctx);
    if (route === 'POST /api/program') return program.save(ctx);
    if (route === 'POST /api/advice') return program.advice(ctx);
    if (route === 'POST /api/plan') return ai.plan(ctx);
    if (route === 'POST /api/transcribe') return ai.transcribe(ctx);
    if (route === 'POST /api/analyze') return analyze.onRequestPost(ctx);
    if (route === 'GET /api/items') return items.onRequestGet(ctx);
    if (route === 'PUT /api/items') return items.onRequestPut(ctx);
    if (route === 'POST /api/review') return items.approve(ctx);
    if (route === 'POST /api/parse') return memory.parse(ctx);
    if (route === 'DELETE /api/items') return items.onRequestDelete(ctx);
    if (route === 'GET /api/quick') return memory.quick(ctx);
    if (route === 'POST /api/quick') return memory.add(ctx);
    if (route === 'POST /api/meals') return memory.save(ctx);
    if (route === 'DELETE /api/meals') return memory.remove(ctx);
    if (route === 'GET /api/burn') return items.burnList(ctx);
    if (route === 'DELETE /api/burn') return items.burnClear(ctx);
    if (route === 'POST /api/burn') return items.burn(ctx);
    if (route === 'POST /api/acts') return items.actAdd(ctx);
    if (route === 'DELETE /api/acts') return items.actDel(ctx);
    if (route === 'POST /api/src') return items.src(ctx);
    if (route === 'POST /api/goal') return items.goal(ctx);
    if (route === 'POST /api/weight') return items.weight(ctx);
    if (route === 'GET /api/push') return push.get(ctx);
    if (route === 'POST /api/push') return push.save(ctx);
    if (route === 'POST /api/synckey') return auth.syncKey(ctx);
    if (route === 'POST /api/logout') return auth.logout(ctx);
    if (route === 'DELETE /api/account') return auth.deleteAccount(ctx);
    if (user.admin && route === 'GET /api/pending') return auth.pending(ctx);
    if (user.admin && route === 'POST /api/decide') return auth.decide(ctx);
    return new Response('Niet gevonden', { status: 404 });
  },
  async scheduled(event, env) {
    await auth.ensureSchema(env);
    if (new Date(event.scheduledTime).getMinutes() % 10 === 0) await analyze.retryQueue(env); // wachtrij blijft elke 10 min
    await push.remind(env);
  },
};
