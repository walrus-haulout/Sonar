'use client';

/**
 * React Error Boundary
 * Catches errors in child components and displays fallback UI
 */

import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    // Log error details for debugging
    console.error('Error Boundary caught:', error, errorInfo);
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error | null;
  reset: () => void;
}

/**
 * Default error fallback UI
 */
function DefaultErrorFallback({ error, reset }: DefaultErrorFallbackProps): ReactNode {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sonar-abyss p-4">
      <div className="w-full max-w-md">
        <div className="bg-sonar-abyss/50 border border-sonar-coral/30 rounded-lg p-6 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-sonar-coral/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-sonar-coral" />
            </div>
            <h1 className="text-lg font-semibold text-sonar-coral font-mono">Error</h1>
          </div>

          {/* Message */}
          <p className="text-sm text-sonar-highlight-bright/70 mb-4">
            Something went wrong. Try refreshing the page or go back.
          </p>

          {/* Error Details (dev only) */}
          {process.env.NODE_ENV === 'development' && error && (
            <details className="mb-6 text-xs">
              <summary className="cursor-pointer text-sonar-signal/70 hover:text-sonar-signal mb-2 font-mono">
                Error Details
              </summary>
              <pre className="bg-sonar-abyss rounded p-3 text-sonar-highlight/50 overflow-auto max-h-40">
                {error.message}
              </pre>
            </details>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-sonar-signal/20 hover:bg-sonar-signal/30 text-sonar-signal rounded-lg font-mono text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <a
              href="/"
              className="flex-1 px-4 py-2 bg-sonar-highlight/20 hover:bg-sonar-highlight/30 text-sonar-highlight-bright rounded-lg font-mono text-sm transition-colors text-center"
            >
              Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
