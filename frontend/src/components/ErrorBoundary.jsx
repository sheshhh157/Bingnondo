import { Component } from 'react';
import '../styles/ErrorBoundary.css';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eb-root" role="alert">
          <div className="eb-card">
            <div className="eb-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 className="eb-title">Something went wrong</h2>
            <p className="eb-desc">
              The dashboard encountered an unexpected error. Your data is safe — this is a display issue.
            </p>
            <button className="eb-btn" onClick={this.handleReload} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M21 12a9 9 0 1 1-9 9c2.52 0 4.93-1 6.74-2.74L21 8"/>
              </svg>
              Reload page
            </button>
            {this.state.error && (
              <details className="eb-details" style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>
                <summary style={{ cursor: 'pointer' }}>Error details</summary>
                <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;