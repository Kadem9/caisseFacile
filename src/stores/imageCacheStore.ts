import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';

import { getApiUrl } from '../services/api';

interface ImageCacheState {
    cachedImages: Record<string, string>; // serverPath -> localFilePath
    isInitializing: boolean;
    downloadImage: (serverUrl: string, serverPath: string) => Promise<string>;
    checkMissingCache: (items: Array<{ imagePath?: string }>) => Promise<void>;
    initCache: () => Promise<void>;
}

export const useImageCacheStore = create<ImageCacheState>()(
    persist(
        (set, get) => ({
            cachedImages: {},
            isInitializing: false,

            initCache: async () => {
                if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;
                if (get().isInitializing) return;
                set({ isInitializing: true });
                try {
                    const dataDir = await appLocalDataDir();
                    const cacheDir = await join(dataDir, 'cached_images');
                    if (!await exists(cacheDir)) {
                        await mkdir(cacheDir, { recursive: true });
                        console.log('[ImageCache] Created cache directory:', cacheDir);
                    }
                } catch (error) {
                    console.error('[ImageCache] Initialization error:', error);
                } finally {
                    set({ isInitializing: false });
                }
            },

            downloadImage: async (serverUrl: string, serverPath: string) => {
                if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return '';

                const { cachedImages } = get();
                // If already cached, check if file still exists
                if (cachedImages[serverPath]) {
                    if (await exists(cachedImages[serverPath])) {
                        return cachedImages[serverPath];
                    }
                }

                try {
                    console.log('[ImageCache] Downloading:', serverUrl);
                    const response = await tauriFetch(serverUrl);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const arrayBuffer = await response.arrayBuffer();
                    const data = new Uint8Array(arrayBuffer);

                    const dataDir = await appLocalDataDir();
                    const fileName = serverPath.split('/').pop() || `img_${Date.now()}`;
                    const localPath = await join(dataDir, 'cached_images', fileName);

                    await writeFile(localPath, data);

                    console.log('[ImageCache] Successfully cached:', localPath);
                    const newCache = { ...get().cachedImages, [serverPath]: localPath };
                    set({ cachedImages: newCache });
                    return localPath;
                } catch (error) {
                    console.error('[ImageCache] Download error:', error);
                    return '';
                }
            },

            checkMissingCache: async (items) => {
                if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;

                const { downloadImage } = get();

                // deduplicate paths
                const uniquePaths = new Set(
                    items.filter(i => i.imagePath).map(i => i.imagePath!)
                );

                console.log(`[ImageCache] Checking ${uniquePaths.size} images...`);

                for (const path of uniquePaths) {
                    // If path already starts with http, use it as-is, otherwise prepend API URL
                    const fullUrl = path.startsWith('http') ? path : `${getApiUrl()}${path}`;
                    await downloadImage(fullUrl, path);
                }
            },
        }),
        {
            name: 'ma-caisse-image-cache',
        }
    )
);
