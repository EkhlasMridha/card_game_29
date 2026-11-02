import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/index.css';
import { App } from './app/App';

// Make sure bundled web fonts are ready before Phaser rasterises any text.
void document.fonts?.ready;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
