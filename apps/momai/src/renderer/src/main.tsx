import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as JSXRuntime from 'react/jsx-runtime'

if (typeof window !== 'undefined') {
  const actualReact = (React as any).default || React
  const actualReactDOM = (ReactDOM as any).default || ReactDOM
  ;(window as any).React = actualReact
  ;(window as any).ReactDOM = actualReactDOM
  ;(window as any).JSXRuntime = JSXRuntime
}

import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OverlayView from './views/OverlayView'
import ErrorBoundary from './components/ErrorBoundary'
import TrayMenuView from './views/TrayMenuView'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <HashRouter>
          <Routes>
            <Route path="/overlay" element={<OverlayView />} />
            <Route path="/tray-menu" element={<TrayMenuView />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </HashRouter>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>
)
