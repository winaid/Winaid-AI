import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error);
    this.logErrorToService(error, errorInfo);
    this.setState({ error, errorInfo });
  }

  logErrorToService = (error: Error, errorInfo: React.ErrorInfo) => {
    const errorLog = {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      componentStack: errorInfo.componentStack?.substring(0, 300),
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };

    try {
      const stored = JSON.parse(localStorage.getItem('error_logs') || '[]');
      stored.unshift(errorLog);
      localStorage.setItem('error_logs', JSON.stringify(stored.slice(0, 5)));
    } catch {
      // 저장 실패해도 무시
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.history.pushState(null, '', '/app');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-5">
          <div className="max-w-lg w-full">
            {/* 메인 카드 */}
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10 text-center">
              {/* 아이콘 */}
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>

              <h1 className="text-xl font-black text-slate-800 mb-2">
                문제가 발생했습니다
              </h1>
              <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">
                예상치 못한 오류가 발생했습니다.<br />
                아래 방법으로 해결할 수 있습니다.
              </p>

              {/* 해결 방법 안내 */}
              <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-2">
                {[
                  { icon: '1', text: '페이지를 새로고침 해보세요' },
                  { icon: '2', text: '브라우저 캐시를 삭제해 보세요' },
                  { icon: '3', text: '문제가 계속되면 관리자에게 문의하세요' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {item.icon}
                    </span>
                    <span className="text-sm text-slate-600 font-medium">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={this.handleReload}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  새로고침
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors"
                >
                  홈으로
                </button>
              </div>

              {/* 에러 상세 (접혀있음) */}
              {this.state.error && (
                <details className="mt-6 text-left">
                  <summary className="text-xs text-slate-400 font-semibold cursor-pointer hover:text-slate-600 transition-colors">
                    오류 상세 정보
                  </summary>
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg overflow-auto max-h-32">
                    <pre className="text-[11px] text-slate-500 whitespace-pre-wrap break-words leading-relaxed">
                      {this.state.error.message}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
