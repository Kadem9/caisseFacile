import React, { useState, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { useImageCacheStore } from '../../stores/imageCacheStore';
import { useSyncStore } from '../../stores/syncStore';
import { getProductImageUrl } from '../../helpers/urlHelper';

interface CachedImageProps {
    src: string | undefined | null;
    alt: string;
    className?: string;
    fallback?: React.ReactNode;
}

/**
 * Image component that:
 * - Online: loads from server URL
 * - Offline: loads from local cache as base64 data URL
 */
export const CachedImage: React.FC<CachedImageProps> = ({
    src,
    alt,
    className,
    fallback
}) => {
    const [imageSrc, setImageSrc] = useState<string>('');
    const [hasError, setHasError] = useState(false);
    const isOnline = useSyncStore((state) => state.isOnline);
    const cachedImages = useImageCacheStore((state) => state.cachedImages);

    useEffect(() => {
        const loadImage = async () => {
            if (!src) {
                setHasError(true);
                return;
            }

            // Online: use server URL
            if (isOnline) {
                setImageSrc(getProductImageUrl(src));
                setHasError(false);
                return;
            }

            // Offline: try to load from cache
            const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

            if (isTauri) {
                // Find local path in cache
                const localPath = cachedImages[src] || cachedImages[getProductImageUrl(src)];

                if (localPath) {
                    try {
                        // Read file and convert to base64
                        const fileData = await readFile(localPath);
                        const base64 = btoa(
                            String.fromCharCode(...new Uint8Array(fileData))
                        );

                        // Detect mime type from extension
                        const ext = localPath.split('.').pop()?.toLowerCase() || 'jpg';
                        const mimeType = ext === 'png' ? 'image/png' :
                            ext === 'gif' ? 'image/gif' :
                                ext === 'webp' ? 'image/webp' : 'image/jpeg';

                        setImageSrc(`data:${mimeType};base64,${base64}`);
                        setHasError(false);
                        return;
                    } catch (error) {
                        console.error('[CachedImage] Failed to load from cache:', error);
                    }
                }
            }

            // Fallback: try server URL anyway (will fail if offline)
            setImageSrc(getProductImageUrl(src));
            setHasError(false);
        };

        loadImage();
    }, [src, isOnline, cachedImages]);

    if (hasError || !imageSrc) {
        return fallback ? <>{fallback}</> : null;
    }

    return (
        <img
            src={imageSrc}
            alt={alt}
            className={className}
            onError={() => setHasError(true)}
        />
    );
};
