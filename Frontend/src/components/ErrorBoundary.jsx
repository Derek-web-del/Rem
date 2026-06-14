import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-neutral-100 px-6 text-center">
          <h2 className="text-xl font-bold text-neutral-900">Something went wrong.</h2>
          <p className="mt-2 max-w-md text-sm text-neutral-600">
            Please refresh the page or contact support if the problem continues.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
