import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from './src/lib/core/auth-context';

vi.mock('./src/lib/core/auth-context', () => ({
  useAuth: () => ({ user: null, authStatus: 'idle', loading: false }),
}));

describe('test', () => {
  it('works', () => {
    const { container } = render(<MemoryRouter><div>test</div></MemoryRouter>);
    expect(container.textContent).toBe('test');
  });
});
