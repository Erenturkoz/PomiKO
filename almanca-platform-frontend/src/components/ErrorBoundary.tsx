import { Component, ReactNode } from 'react';
import { ErrorPage } from '../pages/ErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Uygulamanın herhangi bir yerinde beklenmedik bir render hatası olursa boş/bozuk
// ekran yerine tatlı ErrorPage'i gösterir. "Geri dön" hem bu durumu temizler hem
// de farklı bir sayfaya yönlendirir — aksi halde aynı bozuk sayfada tekrar çöker.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Beklenmeyen hata:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorPage onReset={this.reset} />;
    }
    return this.props.children;
  }
}
