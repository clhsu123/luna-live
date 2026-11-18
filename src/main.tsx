import React, { lazy, Suspense } from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const DigitalHuman = lazy(() => import('./DigitalHuman'));
// Retired wardrobe bookmarks open the retained Anam mode.
if (location.pathname === '/portraits') location.replace('/anam');
createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<p role="status">載入 Luna Live…</p>}><DigitalHuman key={location.pathname} anam={location.pathname !== '/companion'} portrait={location.pathname === '/companion'} companion={location.pathname === '/companion'}/></Suspense></React.StrictMode>);
