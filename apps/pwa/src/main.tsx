import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

// Surface fatal startup errors ON the page — embedded browsers (VS Code
// Simple Browser) give users no console, so a crash otherwise looks like a
// silent black screen.
function showFatal(msg: string): void {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#1a0505;color:#ff6666;' +
    'padding:16px;font:12px monospace;white-space:pre-wrap;overflow:auto;margin:0';
  el.textContent = `WITNESS STARTUP ERROR\n\n${msg}`;
  document.body.appendChild(el);
}
window.addEventListener('error', (e) => showFatal(e.error?.stack ?? e.message));
window.addEventListener('unhandledrejection', (e) =>
  showFatal(String((e.reason as Error)?.stack ?? e.reason)),
);

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (err) {
  showFatal((err as Error)?.stack ?? String(err));
}
