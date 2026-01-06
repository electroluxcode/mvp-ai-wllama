/**
 * Cache Manager for model files using IndexedDB
 * This implementation uses IndexedDB for better browser compatibility
 * Supports all modern browsers including older Chrome versions
 */

const DB_NAME = 'wllama-cache';
const DB_VERSION = 1;
const STORE_FILES = 'files';

export interface CacheEntryMetadata {
  originalURL: string;
  [key: string]: any; // 允许扩展其他字段
}

export interface CacheEntry {
  name: string;
  size: number;
  metadata: CacheEntryMetadata;
}

export interface DownloadOptions {
  progressCallback?: (progress: { loaded: number; total: number }) => void;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Cached file object stored in IndexedDB
 * This structure is extensible - you can add more fields as needed
 */
export interface CachedFile {
  blob: Blob;
  originalURL: string;
  createdAt?: number; // 创建时间戳
  etag?: string; // HTTP etag
  contentType?: string; // 内容类型
  [key: string]: any; // 允许扩展其他字段
}

/**
 * Convert URL to file name using SHA-1 hash
 */
async function urlToFileName(url: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(url)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hashHex}_${url.split('/').pop()}`;
}

/**
 * Get IndexedDB database instance
 */
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      const db = request.result;
      // Verify object store exists
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        // If store doesn't exist, reopen with higher version to trigger upgrade
        db.close();
        const upgradeRequest = indexedDB.open(DB_NAME, DB_VERSION + 1);
        upgradeRequest.onerror = () => reject(new Error(`Failed to upgrade IndexedDB: ${upgradeRequest.error?.message}`));
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDb = (event.target as IDBOpenDBRequest).result;
          if (upgradeDb.objectStoreNames.contains(STORE_FILES)) {
            upgradeDb.deleteObjectStore(STORE_FILES);
          }
          upgradeDb.createObjectStore(STORE_FILES);
        };
        return;
      }
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
    };
  });
}

/**
 * Cache Manager class
 */
export class CacheManager {
  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * Convert a given URL into file name in cache
   */
  async getNameFromURL(url: string): Promise<string> {
    return await urlToFileName(url);
  }

  /**
   * Download file from URL and save to cache
   */
  async download(url: string, options: DownloadOptions = {}): Promise<void> {
    const filename = await urlToFileName(url);

    const response = await fetch(url, {
      headers: options.headers,
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Read the entire response into a Blob
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (options.progressCallback && total > 0) {
        options.progressCallback({ loaded, total });
      }
    }

    const blob = new Blob(chunks as BlobPart[]);
    const db = await getDB();

    // Store file as an extensible object with all metadata
    const cachedFile: CachedFile = {
      blob,
      originalURL: url,
      createdAt: Date.now(),
      etag: response.headers.get('etag') || undefined,
      contentType: response.headers.get('content-type') || undefined,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readwrite');
      
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      const fileStore = transaction.objectStore(STORE_FILES);
      const fileRequest = fileStore.put(cachedFile, filename);
      fileRequest.onerror = () => reject(new Error(`Failed to store file: ${fileRequest.error?.message}`));
    });
  }

  /**
   * Open a file in cache for reading
   */
  async open(nameOrURL: string): Promise<File | null> {
    const db = await getDB();
    let fileName = nameOrURL;

    // Try direct name first
    try {
      const file = await this.getFileFromDB(db, fileName);
      if (file) return file;
    } catch {
      // Try converting URL to filename
      try {
        fileName = await urlToFileName(nameOrURL);
        const file = await this.getFileFromDB(db, fileName);
        if (file) return file;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Get file from IndexedDB
   */
  private getFileFromDB(db: IDBDatabase, fileName: string): Promise<File | null> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readonly');
      const store = transaction.objectStore(STORE_FILES);
      const request = store.get(fileName);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const cachedFile = request.result as CachedFile | undefined;
        if (cachedFile && cachedFile.blob) {
          // Convert Blob to File
          const file = new File([cachedFile.blob], fileName, { type: 'application/octet-stream' });
          resolve(file);
        } else {
          resolve(null);
        }
      };
    });
  }

  /**
   * Get the size of a file in cache
   */
  async getSize(name: string): Promise<number> {
    try {
      const file = await this.open(name);
      return file ? file.size : -1;
    } catch {
      return -1;
    }
  }

  /**
   * Get metadata of a cached file
   */
  async getMetadata(name: string): Promise<CacheEntryMetadata | null> {
    const db = await getDB();
    let fileName = name;

    // Try converting URL to filename if needed
    try {
      if (name.startsWith('http://') || name.startsWith('https://')) {
        fileName = await urlToFileName(name);
      }
    } catch {
      // Ignore
    }

    try {
      const cachedFile = await this.getCachedFileFromDB(db, fileName);
      if (cachedFile) {
        // Return all metadata fields, excluding blob
        const metadata: CacheEntryMetadata = {
          originalURL: cachedFile.originalURL || name,
        };
        
        // Copy all other fields except blob
        Object.keys(cachedFile).forEach(key => {
          if (key !== 'blob' && key !== 'originalURL') {
            metadata[key] = (cachedFile as any)[key];
          }
        });
        
        return metadata;
      }
    } catch {
      // Fallback: return metadata with name as URL
      const cachedSize = await this.getSize(name);
      return cachedSize > 0
        ? {
            originalURL: name,
          }
        : null;
    }

    return null;
  }

  /**
   * Get cached file object from IndexedDB
   */
  private getCachedFileFromDB(db: IDBDatabase, fileName: string): Promise<CachedFile | null> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readonly');
      const store = transaction.objectStore(STORE_FILES);
      const request = store.get(fileName);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const cachedFile = request.result as CachedFile | undefined;
        resolve(cachedFile || null);
      };
    });
  }

  /**
   * List all files currently in cache
   */
  async list(): Promise<CacheEntry[]> {
    const db = await getDB();
    const result: CacheEntry[] = [];

    // Get all files
    const allFiles = await this.getAllFiles(db);
    for (const [fileName, cachedFile] of Object.entries(allFiles)) {
      // Build metadata object from cached file, excluding blob
      const metadata: CacheEntryMetadata = {
        originalURL: cachedFile.originalURL || fileName,
      };
      
      // Copy all other fields except blob
      Object.keys(cachedFile).forEach(key => {
        if (key !== 'blob' && key !== 'originalURL') {
          metadata[key] = (cachedFile as any)[key];
        }
      });
      
      result.push({
        name: fileName,
        size: cachedFile.blob.size,
        metadata,
      });
    }

    return result;
  }

  /**
   * Get all files from IndexedDB
   */
  private getAllFiles(db: IDBDatabase): Promise<Record<string, CachedFile>> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readonly');
      const store = transaction.objectStore(STORE_FILES);
      
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();

      let keys: string[] = [];
      let values: CachedFile[] = [];
      let completed = 0;

      const checkComplete = () => {
        completed++;
        if (completed === 2) {
          const files: Record<string, CachedFile> = {};
          keys.forEach((key, index) => {
            if (values[index]) {
              files[key] = values[index];
            }
          });
          resolve(files);
        }
      };

      keysRequest.onerror = () => reject(keysRequest.error);
      keysRequest.onsuccess = () => {
        keys = keysRequest.result as string[];
        checkComplete();
      };

      valuesRequest.onerror = () => reject(valuesRequest.error);
      valuesRequest.onsuccess = () => {
        values = valuesRequest.result as CachedFile[];
        checkComplete();
      };
    });
  }

  /**
   * Clear all files currently in cache
   */
  async clear(): Promise<void> {
    await this.deleteMany(() => true);
  }

  /**
   * Delete a single file in cache
   */
  async delete(nameOrURL: string): Promise<void> {
    const db = await getDB();
    
    let fileName: string;
    
    // Check if nameOrURL looks like a URL (starts with http:// or https://)
    const isURL = nameOrURL.startsWith('http://') || nameOrURL.startsWith('https://') || nameOrURL.startsWith('/');
    
    if (isURL) {
      // Convert URL to filename
      fileName = await this.getNameFromURL(nameOrURL);
    } else {
      // It's already a filename, use it directly
      fileName = nameOrURL;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readwrite');
      
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      // Delete the file
      const fileStore = transaction.objectStore(STORE_FILES);
      fileStore.delete(fileName);
    });
  }

  /**
   * Delete multiple files in cache
   */
  async deleteMany(predicate: (e: CacheEntry) => boolean): Promise<void> {
    const db = await getDB();
    const list = await this.list();
    
    const deleteItems = list.filter(predicate).map(item => item.name);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readwrite');
      
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      const fileStore = transaction.objectStore(STORE_FILES);

      for (const fileName of deleteItems) {
        fileStore.delete(fileName);
      }
    });
  }

  /**
   * Check if a file exists in cache
   */
  async exists(nameOrURL: string): Promise<boolean> {
    const file = await this.open(nameOrURL);
    return file !== null;
  }

  /**
   * Write a file to cache from File or Blob
   */
  async write(
    url: string,
    file: File | Blob,
    metadata?: CacheEntryMetadata
  ): Promise<void> {
    const fileName = await urlToFileName(url);
    const db = await getDB();

    // Store file as an extensible object
    const cachedFile: CachedFile = {
      blob: file,
      originalURL: metadata?.originalURL || url,
      createdAt: Date.now(),
      contentType: file instanceof File ? file.type : undefined,
      // Copy any additional metadata fields
      ...(metadata ? Object.fromEntries(
        Object.entries(metadata).filter(([key]) => key !== 'originalURL')
      ) : {}),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_FILES], 'readwrite');
      
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      const fileStore = transaction.objectStore(STORE_FILES);
      const fileRequest = fileStore.put(cachedFile, fileName);
      fileRequest.onerror = () => reject(new Error(`Failed to store file: ${fileRequest.error?.message}`));
    });
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
