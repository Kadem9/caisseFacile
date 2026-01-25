import { getApiUrl } from '../services/api';

/**
 * Resolves the full URL for a product image.
 * Online: always use server URL
 * Offline: return server URL (fallback - images won't load but app works)
 */
export const getProductImageUrl = (imagePath: string | undefined | null): string => {
    if (!imagePath) return '';

    // Blob and data URLs are always used as-is
    if (imagePath.startsWith('blob:') || imagePath.startsWith('data:')) {
        return imagePath;
    }

    // Build the server URL
    let serverUrl = imagePath;

    // Sanitize old localhost URLs from database
    if (imagePath.includes('localhost:3001')) {
        serverUrl = imagePath.replace(/http:\/\/localhost:3001/, getApiUrl());
    } else if (!imagePath.startsWith('http')) {
        // Relative path - prepend API URL
        if (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/')) {
            const baseUrl = getApiUrl();
            const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
            serverUrl = `${baseUrl}${cleanPath}`;
        }
    }

    return serverUrl;
};
