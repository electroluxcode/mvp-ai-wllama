type StorageKey = 'conversations' | 'params' | 'welcome' | 'custom_models';

export const WllamaStorage = {
  save<T>(key: StorageKey, data: T) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  },
  load<T>(key: StorageKey, defaultValue: T): T {
    if (typeof window !== 'undefined' && window.localStorage && localStorage[key]) {
      try {
        return JSON.parse(localStorage[key]);
      } catch (e) {
        return defaultValue;
      }
    }
    return defaultValue;
  },
};

