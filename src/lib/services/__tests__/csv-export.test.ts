import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCsv } from '../csv-export';

describe('exportCsv', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    document.body.appendChild = vi.fn() as any;
    document.body.removeChild = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate correct CSV content and trigger download', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const columns = [
      { label: 'Name', value: (r: typeof rows[0]) => r.name },
      { label: 'Age', value: (r: typeof rows[0]) => r.age },
    ];

    exportCsv(rows, columns, 'test-report');

    const link = vi.mocked(document.body.appendChild).mock.calls[0][0] as HTMLAnchorElement;
    expect(link.href).toBe('blob:test');
    expect(link.download).toBe('test-report.csv');
  });

  it('should escape commas and quotes in values', () => {
    const rows = [
      { name: 'Doe, John', note: 'He said "hello"' },
    ];
    const columns = [
      { label: 'Name', value: (r: typeof rows[0]) => r.name },
      { label: 'Note', value: (r: typeof rows[0]) => r.note },
    ];

    exportCsv(rows, columns, 'escape-test');
    const link = vi.mocked(document.body.appendChild).mock.calls[0][0] as HTMLAnchorElement;
    expect(link).toBeTruthy();
  });

  it('should handle null/undefined values as empty string', () => {
    const rows = [{ name: 'Test', value: null as string | null }];
    const columns = [
      { label: 'Name', value: (r: typeof rows[0]) => r.name },
      { label: 'Value', value: (r: typeof rows[0]) => r.value },
    ];

    exportCsv(rows, columns, 'null-test');
    const link = vi.mocked(document.body.appendChild).mock.calls[0][0] as HTMLAnchorElement;
    expect(link).toBeTruthy();
  });

  it('should revoke blob URL after download', () => {
    const rows = [{ name: 'A' }];
    const columns = [{ label: 'Name', value: (r: typeof rows[0]) => r.name }];

    vi.useFakeTimers();
    exportCsv(rows, columns, 'revoke-test');
    vi.runAllTimers();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
