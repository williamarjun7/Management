import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from './lib/core/query-client'
import { AuthProvider } from './lib/core/auth-context'
import { ThemeProvider } from './lib/core/theme-context'
import { SettingsProvider } from './lib/core/settings-context'
import App from './App'
import { ToastContainer } from './components/ui/toast'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SettingsProvider>
          <AuthProvider>
            <App />
            <ToastContainer />
          </AuthProvider>
          </SettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
