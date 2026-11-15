import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Ostatnia linia obrony – błąd renderowania nie zostawia pustego ekranu. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Błąd interfejsu:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center bg-midnight px-6 text-center text-ink">
        <h1 className="text-lg font-semibold">Wystąpił nieoczekiwany błąd interfejsu</h1>
        <p className="mt-2 max-w-md text-sm text-muted">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-soft"
        >
          Uruchom panel ponownie
        </button>
      </div>
    );
  }
}
