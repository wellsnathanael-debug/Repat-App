import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
// Brand typography: Neue Montreal is the Healix brand typeface; per the brand
// book, Inter is the sanctioned replacement when it isn't available. Inter is
// bundled (self-hosted, works offline). When the Neue Montreal WOFF2 files
// arrive, add @font-face rules in styles.css — the font stack already lists
// it first, so it takes over automatically.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
