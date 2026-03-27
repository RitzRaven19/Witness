/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Background Sync handler.
 *
 * When the browser fires a 'witness-upload' sync event (registered by
 * registerBackgroundSync() after each capture), we message all active
 * clients so the in-app upload queue drains itself.
 *
 * If no clients are active the event is ignored — the queue will drain
 * the next time the app opens and finds connectivity.
 */
self.addEventListener('sync', (event) => {
  if ((event as SyncEvent).tag !== 'witness-upload') return;
  (event as SyncEvent).waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'WITNESS_SYNC_UPLOAD' });
      }
    })
  );
});
