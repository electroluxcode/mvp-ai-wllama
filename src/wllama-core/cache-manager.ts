/**
 * Cache Manager for model files using OPFS (Origin Private File System)
 * This implementation is simplified and doesn't depend on React
 */

const PREFIX_METADATA = '__metadata__';
export const POLYFILL_ETAG = 'polyfill_for_older_version';

export interface CacheEntryMetadata {
  etag: string;
  originalSize: number;
  originalURL: string;
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
 * Convert URL to file name using SHA-1 hash
 */
async function urlToFileName(url: string, prefix: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(url)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hashHex}_${url.split('/').pop()}`;
}

/**
 * Get cache directory handle
 */
async function getCacheDir(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    throw new Error('OPFS is not available. This requires a secure context (HTTPS or localhost).');
  }
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });
  return cacheDir;
}

/**
 * Cache Manager class
 */
export class CacheManager {
  /**
   * Convert a given URL into file name in cache
   */
  async getNameFromURL(url: string): Promise<string> {
    return await urlToFileName(url, '');
  }

  /**
   * Download file from URL and save to cache
   */
  async download(url: string, options: DownloadOptions = {}): Promise<void> {
    const metadataFileName = await urlToFileName(url, PREFIX_METADATA);
    const filename = await urlToFileName(url, '');

    const response = await fetch(url, {
      headers: options.headers,
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const etag = response.headers.get('etag') || '';

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const cacheDir = await getCacheDir();

    // Write metadata first
    const metadata: CacheEntryMetadata = {
      etag: etag || POLYFILL_ETAG,
      originalSize: total,
      originalURL: url,
    };
    const metadataHandle = await cacheDir.getFileHandle(metadataFileName, { create: true });
    const metadataWritable = await metadataHandle.createWritable();
    await metadataWritable.write(new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    await metadataWritable.close();

    // Write file content
    const fileHandle = await cacheDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.truncate(0);

    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      loaded += value.length;
      if (options.progressCallback && total > 0) {
        options.progressCallback({ loaded, total });
      }
    }

    await writable.close();
  }

  /**
   * Open a file in cache for reading
   */
  async open(nameOrURL: string): Promise<File | null> {
    const cacheDir = await getCacheDir();
    let fileName = nameOrURL;

    // Try direct name first
    try {
      const fileHandle = await cacheDir.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch {
      // Try converting URL to filename
      try {
        fileName = await urlToFileName(nameOrURL, '');
        const fileHandle = await cacheDir.getFileHandle(fileName);
        return await fileHandle.getFile();
      } catch {
        return null;
      }
    }
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
    const cacheDir = await getCacheDir();
    
    // Try to get metadata file
    let metadataFileName: string;
    try {
      metadataFileName = await urlToFileName(name, PREFIX_METADATA);
    } catch {
      // If name is already a filename, try to find corresponding metadata
      metadataFileName = `${PREFIX_METADATA}${name}`;
    }
    
    try {
      const fileHandle = await cacheDir.getFileHandle(metadataFileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as CacheEntryMetadata;
    } catch {
      // Fallback: return polyfill metadata if file exists
      const cachedSize = await this.getSize(name);
      return cachedSize > 0
        ? {
            etag: POLYFILL_ETAG,
            originalSize: cachedSize,
            originalURL: name,
          }
        : null;
    }
  }

  /**
   * List all files currently in cache
   */
  async list(): Promise<CacheEntry[]> {
    const cacheDir = await getCacheDir();
    const result: CacheEntry[] = [];
    const metadataMap: Record<string, CacheEntryMetadata> = {};

    // First pass: collect metadata
    // @ts-ignore - entries() exists but TypeScript types may not include it
    for await (const [name, handler] of cacheDir.entries()) {
      if (handler.kind === 'file' && name.startsWith(PREFIX_METADATA)) {
        try {
          const file = await (handler as FileSystemFileHandle).getFile();
          const text = await file.text();
          const meta = JSON.parse(text) as CacheEntryMetadata;
          metadataMap[name.replace(PREFIX_METADATA, '')] = meta;
        } catch {
          // Skip corrupted metadata
        }
      }
    }

    // Second pass: collect files
    // @ts-ignore - entries() exists but TypeScript types may not include it
    for await (const [name, handler] of cacheDir.entries()) {
      if (handler.kind === 'file' && !name.startsWith(PREFIX_METADATA)) {
        try {
          const file = await (handler as FileSystemFileHandle).getFile();
          result.push({
            name,
            size: file.size,
            metadata: metadataMap[name] || {
              originalSize: file.size,
              originalURL: '',
              etag: POLYFILL_ETAG,
            },
          });
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return result;
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
    const cacheDir = await getCacheDir();
    const fileName = await this.getNameFromURL(nameOrURL);
    const metadataFileName = await urlToFileName(nameOrURL, PREFIX_METADATA);

    try {
      await cacheDir.removeEntry(fileName);
    } catch {
      // File might not exist
    }

    try {
      await cacheDir.removeEntry(metadataFileName);
    } catch {
      // Metadata might not exist
    }
  }

  /**
   * Delete multiple files in cache
   */
  async deleteMany(predicate: (e: CacheEntry) => boolean): Promise<void> {
    const cacheDir = await getCacheDir();
    const list = await this.list();
    
    for (const item of list) {
      if (predicate(item)) {
        try {
          await cacheDir.removeEntry(item.name);
          const metadataFileName = await urlToFileName(item.metadata.originalURL || item.name, PREFIX_METADATA);
          await cacheDir.removeEntry(metadataFileName);
        } catch {
          // File might already be deleted
        }
      }
    }
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
    const cacheDir = await getCacheDir();
    const fileName = await urlToFileName(url, '');
    const metadataFileName = await urlToFileName(url, PREFIX_METADATA);

    // Write metadata
    const fileMetadata: CacheEntryMetadata = metadata || {
      etag: '',
      originalSize: file.size,
      originalURL: url,
    };
    const metadataHandle = await cacheDir.getFileHandle(metadataFileName, { create: true });
    const metadataWritable = await metadataHandle.createWritable();
    await metadataWritable.write(new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    await metadataWritable.close();

    // Write file content
    const fileHandle = await cacheDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.truncate(0);
    
    if (file instanceof File) {
      const stream = file.stream();
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } else {
      await writable.write(file);
    }
    
    await writable.close();
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

