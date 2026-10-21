import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { keepDocumentUnscrolled } from './lib/viewport';
import { startKeyboardTracking } from './lib/keyboard';

startKeyboardTracking();
keepDocumentUnscrolled();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
