import React, { lazy, Suspense } from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const DigitalHuman = lazy(() => import('./DigitalHuman'));
// All existing entry URLs now open the same production Anam conversation.
createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<p role="status">載入 Luna Live…</p>}><DigitalHuman key={location.pathname} anam={location.pathname !== '/portraits'} portrait={location.pathname === '/portraits'}/></Suspense></React.StrictMode>);
