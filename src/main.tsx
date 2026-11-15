import React, { lazy, Suspense } from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const App = lazy(() => import('./App'));
const DigitalHuman = lazy(() => import('./DigitalHuman'));
createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<p role="status">載入 Luna Live…</p>}>{location.pathname === '/digital' ? <DigitalHuman/> : <App/>}</Suspense></React.StrictMode>);
