import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './features/auth/model/AuthProvider';
import { EntitlementProvider } from './features/subscription/model/EntitlementProvider';
import './styles/global.css';

const productionClosedHosts = new Set(['dodoudou.com', 'www.dodoudou.com']);
const isProductionClosedHost = productionClosedHosts.has(window.location.hostname.toLowerCase());

if (isProductionClosedHost && window.location.pathname !== '/official-login.html') {
  window.location.replace('/official-login.html');
} else {
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
}
