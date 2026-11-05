import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';
createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) window.dispatchEvent(new Event('traice:updated')); });
  navigator.serviceWorker.register('/sw.js');
});
