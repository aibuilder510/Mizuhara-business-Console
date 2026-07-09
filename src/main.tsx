// Prevent issues with read-only window.fetch/globalThis.fetch in sandbox iframe environments
try {
  if (typeof window !== "undefined" && window.fetch) {
    const originalFetch = window.fetch;
    const descriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    if (descriptor && !descriptor.writable) {
      Object.defineProperty(window, "fetch", {
        value: originalFetch,
        writable: true,
        configurable: true,
      });
    }
  }
  if (typeof globalThis !== "undefined" && globalThis.fetch) {
    const originalFetch = globalThis.fetch;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    if (descriptor && !descriptor.writable) {
      Object.defineProperty(globalThis, "fetch", {
        value: originalFetch,
        writable: true,
        configurable: true,
      });
    }
  }
} catch (e) {
  console.warn("Failed to patch fetch descriptiveness:", e);
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
