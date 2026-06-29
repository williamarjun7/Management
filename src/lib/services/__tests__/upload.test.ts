import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../core/insforge', () => ({
  insforge: {
    storage: { from: mockFrom },
  },
}));

describe('upload', () => {
  beforeEach(() => { mockFrom.mockReset(); });

  async function importModule() {
    vi.resetModules();
    return await import('../upload');
  }

  describe('uploadImage', () => {
    it('should upload a file and return url and key', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        data: { url: 'https://example.com/img.jpg', key: 'folder/123.jpg' },
        error: null,
      });
      mockFrom.mockReturnValue({ upload: mockUpload });

      const { uploadImage } = await importModule();
      const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const result = await uploadImage(file, 'folder');
      expect(result.url).toBe('https://example.com/img.jpg');
      expect(result.key).toContain('folder/');
      expect(mockFrom).toHaveBeenCalledWith('cafe-images');
    });

    it('should throw on upload error', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        data: null, error: new Error('Upload failed'),
      });
      mockFrom.mockReturnValue({ upload: mockUpload });

      const { uploadImage } = await importModule();
      const file = new File(['test'], 'photo.jpg');
      await expect(uploadImage(file, 'menu')).rejects.toThrow('Upload failed');
    });

    it('should throw when no data returned', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        data: null, error: null,
      });
      mockFrom.mockReturnValue({ upload: mockUpload });

      const { uploadImage } = await importModule();
      const file = new File(['test'], 'photo.jpg');
      await expect(uploadImage(file, 'menu')).rejects.toThrow('Upload returned no data');
    });
  });

  describe('deleteImage', () => {
    it('should delete an image by key', async () => {
      const mockRemove = vi.fn().mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({ remove: mockRemove });

      const { deleteImage } = await importModule();
      await deleteImage('folder/img.jpg');
      expect(mockRemove).toHaveBeenCalledWith('folder/img.jpg');
    });

    it('should throw on delete error', async () => {
      const mockRemove = vi.fn().mockResolvedValue({
        data: null, error: new Error('Delete failed'),
      });
      mockFrom.mockReturnValue({ remove: mockRemove });

      const { deleteImage } = await importModule();
      await expect(deleteImage('folder/img.jpg')).rejects.toThrow('Delete failed');
    });
  });

  describe('getPublicUrl', () => {
    it('should construct public URL', async () => {
      const { getPublicUrl } = await importModule();
      vi.stubEnv('VITE_INSFORGE_URL', 'https://insforge.example.com');
      const url = getPublicUrl('folder/img.jpg');
      expect(url).toContain('buckets/cafe-images/objects/folder/img.jpg');
      vi.unstubAllEnvs();
    });
  });

  describe('extractStorageKeyFromUrl', () => {
    it('should extract key from URL', async () => {
      const { extractStorageKeyFromUrl } = await importModule();
      const key = extractStorageKeyFromUrl('https://example.com/objects/folder/img.jpg');
      expect(key).toBe('folder/img.jpg');
    });

    it('should return null for invalid URL', async () => {
      const { extractStorageKeyFromUrl } = await importModule();
      expect(extractStorageKeyFromUrl('not-a-url')).toBeNull();
    });
  });
});
