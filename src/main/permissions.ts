import { session } from "electron";

/**
 * Web-content permissions for browser panes. We care specifically about
 * notifications: an allow-listed origin (e.g. Google Calendar) may raise Web
 * Notifications, which Electron surfaces as native OS notifications, so its
 * event reminders reach the user while the tab is open. Any other origin is
 * denied notifications so an arbitrary page can't spam. Other permission kinds
 * keep Electron's default (grant), so normal browsing isn't affected.
 */

// Origins permitted to show desktop notifications from a browser pane.
// Add entries here to allow more sites (e.g. Slack, Discord).
const NOTIFY_ORIGINS = new Set<string>([
  "https://calendar.google.com",
  "https://mail.google.com",
]);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function registerWebPermissions(): void {
  const ses = session.defaultSession;

  // Async grant: the page called Notification.requestPermission().
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === "notifications") {
      const origin = originOf(details.requestingUrl);
      return callback(origin !== null && NOTIFY_ORIGINS.has(origin));
    }
    callback(true); // preserve default-grant for other permissions
  });

  // Sync state check: the page read Notification.permission.
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (permission === "notifications") return NOTIFY_ORIGINS.has(requestingOrigin);
    return true;
  });
}
