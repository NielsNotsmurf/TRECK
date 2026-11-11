// Alleen /api vereist het geheim; de app zelf is openbaar.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') && request.headers.get('x-key') !== env.APP_SECRET) {
    return new Response('Geen toegang', { status: 401 });
  }
  return next();
}
