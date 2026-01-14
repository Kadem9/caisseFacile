import { getApiUrl } from '../services/api';
import { useImageCacheStore } from '../stores/imageCacheStore';
import { useSyncStore } from '../stores/syncStore';
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Resolves the full URL for a product image.
 * Logic:
 * - Online: Use server URL (always up-to-date)
 * - Offline: Use local cache (if available)
 */
export const getProductImageUrl = (imagePath: string | undefined | null): string => {
    if (!imagePath) return '';

    // Blob and data URLs are always used as-is
    if (imagePath.startsWith('blob:') || imagePath.startsWith('data:')) {
        return imagePath;
    }

    // Check if we're in Tauri
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

    // Get connection status
    const isOnline = useSyncStore.getState().isOnline;

    // Build the server URL
    let serverUrl = imagePath;
    if (!imagePath.startsWith('http')) {
        // Relative path - prepend API URL
        if (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/')) {
            const baseUrl = getApiUrl();
            const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
            serverUrl = `${baseUrl}${cleanPath}`;
        }
    }

    // If ONLINE: always use server URL
    if (isOnline) {
        return serverUrl;
    }

    // If OFFLINE and in Tauri: try to use cached version
    if (isTauri) {
        const { cachedImages } = useImageCacheStore.getState();
        // Try to find cached version (imagePath is the key, which is the full URL)
        if (cachedImages[imagePath]) {
            try {
                console.log('[urlHelper] Offline - using cached:', imagePath);
                return convertFileSrc(cachedImages[imagePath]);
            } catch (e) {
                console.error('[urlHelper] convertFileSrc error:', e);
            }
        }
        // Also try with serverUrl as key
        if (cachedImages[serverUrl]) {
            try {
                console.log('[urlHelper] Offline - using cached (serverUrl key):', serverUrl);
                return convertFileSrc(cachedImages[serverUrl]);
            } catch (e) {
                console.error('[urlHelper] convertFileSrc error:', e);
            }
        }
    }

    // Fallback: return server URL (will fail if offline, but at least it's the right URL)
    return serverUrl;
};
