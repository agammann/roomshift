import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createPlannerStore, type StorageLike } from './model';
import './styles.css';

let storage: StorageLike | undefined;
try { storage = window.localStorage; } catch { /* Editing still works without device storage. */ }
const store = createPlannerStore(undefined, storage);
store.load();
createRoot(document.getElementById('root')!).render(<App store={store} />);
