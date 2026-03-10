import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'monospace' }}>
          <h1>Something went wrong.</h1>
          <pre style={{ color: 'red' }}>{this.state.error?.toString()}</pre>
          <pre style={{ color: '#666', fontSize: '12px' }}>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', marginTop: '10px' }}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

console.log('App starting...');
try {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');
  
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
  console.log('App mounted successfully');
} catch (e) {
  console.error('Failed to mount app:', e);
  document.body.innerHTML = `<div style="color:red;padding:20px"><h1>Fatal Error</h1><pre>${e}</pre></div>`;
}
