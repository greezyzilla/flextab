import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from './storage';

const chromeStorage = chrome.storage.local;

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should get a value by key', async () => {
      const mockData = { 'test-key': { value: 'test-value', timestamp: Date.now() } };
      (chromeStorage.get as any).mockResolvedValue(mockData);

      const result = await storageManager.get('test-key');

      expect(chromeStorage.get).toHaveBeenCalledWith(['test-key']);
      expect(result).toBe('test-value');
    });

    it('should return undefined for non-existent key', async () => {
      (chromeStorage.get as any).mockResolvedValue({});

      const result = await storageManager.get('non-existent-key');

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should set a value by key', async () => {
      (chromeStorage.set as any).mockResolvedValue();

      await storageManager.set('test-key', 'test-value');

      const expectedValue = expect.objectContaining({
        value: 'test-value',
        timestamp: expect.any(Number),
        expires: undefined,
      });
      expect(chromeStorage.set).toHaveBeenCalledWith({ 'test-key': expectedValue });
    });

    it('should set multiple values', async () => {
      const data = { key1: 'value1', key2: 'value2' };
      (chromeStorage.set as any).mockResolvedValue();

      await storageManager.set('data', data);

      const expectedValue = expect.objectContaining({
        value: data,
        timestamp: expect.any(Number),
        expires: undefined,
      });
      expect(chromeStorage.set).toHaveBeenCalledWith({ data: expectedValue });
    });
  });

  describe('remove', () => {
    it('should remove a value by key', async () => {
      (chromeStorage.remove as any).mockResolvedValue();

      await storageManager.remove('test-key');

      expect(chromeStorage.remove).toHaveBeenCalledWith(['test-key']);
    });

    it('should remove multiple keys', async () => {
      (chromeStorage.remove as any).mockResolvedValue();

      await storageManager.removeMultiple(['key1', 'key2']);

      expect(chromeStorage.remove).toHaveBeenCalledWith(['key1', 'key2']);
    });
  });

  describe('clear', () => {
    it('should clear all storage', async () => {
      (chromeStorage.clear as any).mockResolvedValue();

      await storageManager.clear();

      expect(chromeStorage.clear).toHaveBeenCalled();
    });
  });
});