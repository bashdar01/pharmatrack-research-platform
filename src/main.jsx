import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app runtime-error-page">
          <main>
            <div className="card">
              <h1>Something went wrong</h1>
              <p className="muted">The page could not be displayed, but the app did not go blank. Please refresh and try again.</p>
              <pre>{this.state.error?.message || 'Unknown application error'}</pre>
              <button className="primary" onClick={() => window.location.reload()}>Refresh page</button>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
)
