import { getRuntimeSettings } from './runtimeSettings.js';
import { loadSessionAccount } from './sessionAuth.js';
export async function operatingStatusMiddleware(req, res, next) {
  const general = getRuntimeSettings().general;
  res.locals.appName = general.appName;
  res.locals.timeZone = general.timeZone;
  if (general.systemStatus === 'online' || ['/health', '/login', '/logout', '/forgot-password', '/verify-email', '/sw.js'].includes(req.path) || req.path.startsWith('/reset-password/')) return next();
  try {
    const account = await loadSessionAccount(req.session);
    if (account?.role === 'admin') return next();
  } catch { return next(new Error('Account access could not be checked')); }
  res.set('Retry-After', '300');
  res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/') || req.get('Accept')?.includes('application/json')) return res.status(503).json({ success: false, error: 'The service is temporarily unavailable. Please retry later.' });
  return res.status(503).render('error', { title: 'Service temporarily unavailable', statusCode: 503, message: 'VitalMatch is temporarily unavailable for maintenance. Please retry later or contact your coordinator through the usual emergency contact channel.' });
}
