import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAllMocks } from '../../core/__tests__/setup';
import type { ReactNode } from 'react';

vi.mock('../../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../core/insforge', () => ({
  insforge: { database: { from: mockFrom } },
}));

vi.mock('../../services/audit.service', () => ({
  writeAuditLog: vi.fn(),
  createAuditEntry: vi.fn().mockReturnValue({}),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', IMAGE_UPDATE: 'image.update' },
  AuditEntityTypes: { MENU_CATEGORY: 'menu_category', MENU_ITEM: 'menu_item' },
}));

vi.mock('../../services/upload', () => ({
  deleteImage: vi.fn().mockResolvedValue(undefined),
  extractStorageKeyFromUrl: vi.fn().mockReturnValue('storage-key-123'),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeMockChain(resolvedValue: unknown) {
  const chain = Promise.resolve({ data: resolvedValue, error: null }) as any;
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  return chain;
}

describe('menu.hooks', () => {
  beforeEach(() => { clearAllMocks(); mockFrom.mockReset(); });

  describe('useMenuCategories', () => {
    it('should fetch menu categories', async () => {
      const categories = [{ id: 'c1', name: 'Burgers' }];
      mockFrom.mockReturnValue(makeMockChain(categories));

      const { useMenuCategories } = await import('../menu.hooks');
      const { result } = renderHook(() => useMenuCategories(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(categories);
      expect(mockFrom).toHaveBeenCalledWith('menu_categories');
    });

    it('should throw on error', async () => {
      const chain = makeMockChain([]);
      chain.select.mockResolvedValue({ data: null, error: new Error('DB fail') });
      mockFrom.mockReturnValue(chain);

      const { useMenuCategories } = await import('../menu.hooks');
      const { result } = renderHook(() => useMenuCategories(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useMenuItems', () => {
    it('should fetch all menu items without category filter', async () => {
      const items = [{ id: 'i1', name: 'Burger', category_id: 'c1' }];
      mockFrom.mockReturnValue(makeMockChain(items));

      const { useMenuItems } = await import('../menu.hooks');
      const { result } = renderHook(() => useMenuItems(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFrom).toHaveBeenCalledWith('menu_items');
    });

    it('should filter by category when provided', async () => {
      const items = [{ id: 'i1', name: 'Burger', category_id: 'c1' }];
      const chain = makeMockChain(items);
      mockFrom.mockReturnValue(chain);

      const { useMenuItems } = await import('../menu.hooks');
      const { result } = renderHook(() => useMenuItems('c1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(chain.eq).toHaveBeenCalledWith('category_id', 'c1');
    });
  });

  describe('useCreateMenuCategory', () => {
    it('should create a category', async () => {
      const created = { id: 'c-new', name: 'Desserts', description: null };
      mockFrom.mockReturnValue(makeMockChain(created));

      const { useCreateMenuCategory } = await import('../menu.hooks');
      const { result } = renderHook(() => useCreateMenuCategory(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'Desserts' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useUpdateMenuCategory', () => {
    it('should update a category', async () => {
      const updated = { id: 'c1', name: 'Burgers Updated', description: 'Tasty' };
      mockFrom.mockReturnValue(makeMockChain(updated));

      const { useUpdateMenuCategory } = await import('../menu.hooks');
      const { result } = renderHook(() => useUpdateMenuCategory(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'c1', name: 'Burgers Updated', description: 'Tasty' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeleteMenuCategory', () => {
    it('should delete a category', async () => {
      mockFrom.mockReturnValue(makeMockChain(null));

      const { useDeleteMenuCategory } = await import('../menu.hooks');
      const { result } = renderHook(() => useDeleteMenuCategory(), { wrapper: createWrapper() });

      result.current.mutate('c1');
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useCreateMenuItem', () => {
    it('should create a menu item', async () => {
      const created = { id: 'i-new', name: 'Pizza', category_id: 'c1', price: 200 };
      mockFrom.mockReturnValue(makeMockChain(created));

      const { useCreateMenuItem } = await import('../menu.hooks');
      const { result } = renderHook(() => useCreateMenuItem(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'Pizza', price: 200, category_id: 'c1' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useUpdateMenuItem', () => {
    it('should update a menu item', async () => {
      const updated = { id: 'i1', name: 'Pizza Updated', price: 250, category_id: 'c1' };
      mockFrom.mockReturnValue(makeMockChain(updated));

      const { useUpdateMenuItem } = await import('../menu.hooks');
      const { result } = renderHook(() => useUpdateMenuItem(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'i1', name: 'Pizza Updated', price: 250, category_id: 'c1' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useToggleMenuItemAvailability', () => {
    it('should toggle availability', async () => {
      const toggled = { id: 'i1', is_available: false };
      mockFrom.mockReturnValue(makeMockChain(toggled));

      const { useToggleMenuItemAvailability } = await import('../menu.hooks');
      const { result } = renderHook(() => useToggleMenuItemAvailability(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'i1', is_available: false });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useUpdateMenuItemImage', () => {
    it('should update image URL', async () => {
      const updated = { id: 'i1', image_url: 'https://example.com/img.jpg' };
      mockFrom.mockReturnValue(makeMockChain(updated));

      const { useUpdateMenuItemImage } = await import('../menu.hooks');
      const { result } = renderHook(() => useUpdateMenuItemImage(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'i1', image_url: 'https://example.com/img.jpg' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeleteMenuItem', () => {
    it('should delete item and storage image', async () => {
      const upload = await import('../../services/upload');
      mockFrom.mockReturnValue(makeMockChain(null));

      const { useDeleteMenuItem } = await import('../menu.hooks');
      const { result } = renderHook(() => useDeleteMenuItem(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'i1', image_url: 'https://example.com/objects/img.jpg' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(upload.deleteImage).toHaveBeenCalledWith('storage-key-123');
    });

    it('should delete item without image', async () => {
      mockFrom.mockReturnValue(makeMockChain(null));

      const { useDeleteMenuItem } = await import('../menu.hooks');
      const { result } = renderHook(() => useDeleteMenuItem(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'i2' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });
});
