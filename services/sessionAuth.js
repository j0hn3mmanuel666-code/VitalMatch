import { User } from "../models/userModel.js";
import { getRuntimeSettings } from "./runtimeSettings.js";

export const sessionLifetimeMs = (session) => {
  if (session?.rememberMe === true) return 30 * 86400000;
  const minutes = Number(getRuntimeSettings().security?.sessionTimeout);
  return (Number.isFinite(minutes) ? Math.max(5, Math.min(minutes, 480)) : 30) * 60000;
};

// Missing authVersion deliberately rejects sessions created before the security migration.
export function sessionIsCurrent(session, account, now = Date.now()) {
  return !!(session && account && Number(session.userId) === Number(account.id) &&
    account.isActive === true && account.emailVerified === true && !account.archivedAt &&
    Number.isInteger(session.authVersion) && session.authVersion === Number(account.authVersion) &&
    Number.isFinite(session.authenticatedAt) && Number.isFinite(session.lastActivityAt) &&
    session.authenticatedAt <= now && session.lastActivityAt <= now &&
    session.lastActivityAt >= session.authenticatedAt &&
    now - session.lastActivityAt <= sessionLifetimeMs(session));
}

export async function loadSessionAccount(session) {
  if (!session?.userId) return null;
  const account = await User.findByPk(session.userId, {
    attributes: ["id", "firstName", "lastName", "role", "isActive", "emailVerified", "authVersion", "facilityId", "archivedAt"]
  });
  return sessionIsCurrent(session, account) ? account : null;
}

export function destroySession(req, res, status = 401) {
  const finish = () => {
    res.clearCookie("vitalmatch.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.set("Cache-Control", "private, no-store");
    const accept = req.get?.("Accept") || '';
    // A service worker's network request can have an empty fetch destination
    // even when it is loading an HTML page for browser navigation.
    if (req.path?.startsWith("/api/") || req.path?.endsWith("/api") || accept.includes("application/json") || (req.get?.('Sec-Fetch-Dest') === 'empty' && !accept.includes('text/html'))) {
      return res.status(status).json({ success: false, error: "Authentication required", redirect: "/login" });
    }
    return res.redirect("/login");
  };
  if (req.session?.destroy) return req.session.destroy(finish);
  return finish();
}
