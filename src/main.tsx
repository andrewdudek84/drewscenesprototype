import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { loadUserLibrary } from './userLibrary';

// Kick off the IndexedDB load eagerly so the user's previously-imported USDA
// assets / shapes are available the moment the palettes mount. The promise is
// intentionally fire-and-forget: `loadUserLibrary()` notifies its React
// subscribers when it finishes.
void loadUserLibrary();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
