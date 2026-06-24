import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OverlayView from './views/OverlayView'
import ErrorBoundary from './components/ErrorBoundary'
import { I18nProvider } from './i18n'
import ExtensionPageRoute from './views/ExtensionPageRoute'
import WhatsAppView from './views/WhatsAppView'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <HashRouter>
          <Routes>
            <Route path="/overlay" element={<OverlayView />} />
            <Route path="/extensions/whatsapp" element={<App />} />
            <Route
              path="/extensions/:id"
              element={
                <ExtensionPageRoute
                  fallback={({ extensionId }) => {
                    if (extensionId === 'whatsapp') return <WhatsAppView />
                    return (
                      <div className="p-8 text-text-muted">Extensão não tem UI full-page</div>
                    )
                  }}
                />
              }
            />
            <Route path="/*" element={<App />} />
          </Routes>
        </HashRouter>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>
)
