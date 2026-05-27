import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './features/auth/model/AuthProvider';
import { EntitlementProvider } from './features/subscription/model/EntitlementProvider';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <EntitlementProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </EntitlementProvider>
    </AuthProvider>
  </React.StrictMode>,
);
