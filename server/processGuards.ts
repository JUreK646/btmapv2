/**
 * After an uncaught exception the process is in an unknown state (half-finished transactions,
 * broken invariants), so it must not keep serving requests. The supervisor (Docker
 * `restart: unless-stopped`) starts a clean one. A rejected background promise - a failed sync
 * run, for example - is logged and does not take the server down.
 */
export function installProcessGuards(shutdown: () => void | Promise<void> = () => {}, exitTimeoutMs = 5000) {
  let exiting = false;
  process.on('unhandledRejection', reason => {
    console.error('[Process] Unhandled Rejection:', reason);
  });
  process.on('uncaughtException', err => {
    console.error('[Process] Uncaught Exception:', err);
    if (exiting) return;
    exiting = true;
    process.exitCode = 1;
    // Give open connections and the database a moment to close, but never hang.
    setTimeout(() => process.exit(1), exitTimeoutMs).unref();
    Promise.resolve().then(shutdown).catch(e => console.error('[Process] Shutdown failed:', e)).finally(() => process.exit(1));
  });
}
