import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('../../../lib/core/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../../lib/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/services/telemetry', () => ({
  recordTelemetry: vi.fn(),
}));

vi.mock('../../../lib/services/mutation-queue', () => ({
  hasPendingMutations: vi.fn().mockResolvedValue(false),
  getPendingCount: vi.fn().mockResolvedValue(0),
  getQueueHealth: vi.fn().mockResolvedValue({ queueSize: 0, deadLetterCount: 0 }),
}));

vi.mock('../../../lib/services/realtime', () => ({
  initRealtime: vi.fn(),
  shutdownRealtime: vi.fn(),
}));

function renderPosPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const PosPage = vi.importActual('../../../pages/pos/PosPage');
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PosPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('PosPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'staff@test.com', role: 'staff' },
      authStatus: 'authenticated',
      loading: false,
    });
  });

  it('should render without crashing', async () => {
    const PosPage = (await vi.importActual('../../../pages/pos/PosPage')) as any;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PosPage.default />
        </BrowserRouter>
      </QueryClientProvider>
    );
  });
});
