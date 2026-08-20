import React from 'react';

/**
 * 최후 안전망.
 *
 * 렌더 중 예외가 나면 React는 루트를 통째로 언마운트해 흰 화면만 남긴다.
 * 그 상태에서는 초기화 버튼조차 없어 앱 데이터 삭제 말고는 복구할 방법이 없고,
 * 그러면 저장된 야장 세션과 맨홀 DB까지 함께 사라진다.
 * 여기서 잡아서 "야장 입력값만" 지우는 복구 경로를 남긴다.
 */

const TRENCH_KEY = 'survey_trench_data_v2';
const STANDARD_KEY = 'survey_standard_data_v2';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  /** 야장 입력값만 비운다. 작업세션·맨홀DB는 건드리지 않는다 */
  private resetFieldBook = () => {
    try {
      localStorage.removeItem(TRENCH_KEY);
      localStorage.removeItem(STANDARD_KEY);
    } catch (e) {
      console.error(e);
    }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <h1>야장을 열지 못했습니다</h1>
        <p>
          저장된 입력값이 이 버전과 맞지 않아 화면을 그리지 못했습니다.
          아래에서 <strong>야장 입력값만</strong> 비우면 바로 다시 쓸 수 있습니다.
          저장해 둔 작업세션과 맨홀 DB는 지워지지 않습니다.
        </p>

        <div className="crash-actions">
          <button type="button" className="crash-btn primary" onClick={this.resetFieldBook}>
            야장 입력값 비우고 다시 열기
          </button>
          <button type="button" className="crash-btn" onClick={() => location.reload()}>
            그냥 다시 시도
          </button>
        </div>

        <pre className="crash-detail">{error.message}</pre>
      </div>
    );
  }
}

export default ErrorBoundary;
