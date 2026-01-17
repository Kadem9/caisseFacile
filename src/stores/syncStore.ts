// ===================================
// Sync Store - Synchronization State Management
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    checkHealth,
    syncTransactions,
    syncClosures,
    syncProducts,
    syncMenus,
    syncCategories,
    syncStockMovements,
    getApiUrl,
    setApiUrl as setApiUrlService,
    getSyncDiff,
    type SyncResult,
} from '../services/api';
import { useImageCacheStore } from './imageCacheStore';
import type { Transaction, CashClosure, Product, StockMovement, Menu, Category } from '../types';

// ===================================
// Types
// ===================================

export type SyncEntityType = 'transaction' | 'closure' | 'product' | 'stock_movement' | 'menu' | 'category';

export interface SyncQueueItem {
    id: string;
    type: SyncEntityType;
    data: Transaction | CashClosure | Product | StockMovement | Menu | Category;
    createdAt: Date;
    retryCount: number;
    lastError?: string;
}

export interface SyncLogEntry {
    id: string;
    type: SyncEntityType;
    count: number;
    status: 'success' | 'error';
    message?: string;
    timestamp: Date;
}

export interface SyncState {
    // Connection status
    isOnline: boolean;
    lastHealthCheck: Date | null;

    // Sync status
    isSyncing: boolean;
    lastSyncAt: Date | null;

    // Configuration
    apiUrl: string;
    autoSyncEnabled: boolean;
    syncIntervalMs: number;

    // Queue
    queue: SyncQueueItem[];

    // History
    syncLog: SyncLogEntry[];

    // Handlers (to avoid circular deps)
    productMergeHandler: ((products: Product[]) => void) | null;
    menuMergeHandler: ((menus: Menu[]) => void) | null;
    categoryMergeHandler: ((categories: Category[]) => void) | null;

    // Actions
    checkConnection: () => Promise<boolean>;
    setApiUrl: (url: string) => void;
    setAutoSync: (enabled: boolean) => void;
    registerProductHandler: (handler: (products: Product[]) => void) => void;
    registerMenuHandler: (handler: (menus: Menu[]) => void) => void;
    registerCategoryHandler: (handler: (categories: Category[]) => void) => void;

    // Queue management
    addToQueue: (type: SyncEntityType, data: Transaction | CashClosure | Product | StockMovement | Menu | Category) => void;
    removeFromQueue: (id: string) => void;
    clearQueue: () => void;

    // Sync operations
    syncAll: () => Promise<void>;
    syncEntity: (type: SyncEntityType) => Promise<boolean>;
    pullUpdates: () => Promise<boolean>;

    // Getters
    getPendingCount: () => number;
    getQueueByType: (type: SyncEntityType) => SyncQueueItem[];
}

// ===================================
// Store Implementation
// ===================================

export const useSyncStore = create<SyncState>()(
    persist(
        (set, get) => ({
            // Initial state
            isOnline: false,
            lastHealthCheck: null,
            isSyncing: false,
            lastSyncAt: null,
            apiUrl: getApiUrl(),
            autoSyncEnabled: true,
            syncIntervalMs: 15000, // Reduced to 15s for better UX
            queue: [],
            syncLog: [],
            productMergeHandler: null,
            menuMergeHandler: null,
            categoryMergeHandler: null,

            registerProductHandler: (handler) => {
                set({ productMergeHandler: handler });
            },

            registerMenuHandler: (handler) => {
                set({ menuMergeHandler: handler });
            },

            registerCategoryHandler: (handler) => {
                set({ categoryMergeHandler: handler });
            },

            // Check server connection
            checkConnection: async () => {
                try {
                    const result = await checkHealth();
                    const isOnline = result.success;
                    set({
                        isOnline,
                        lastHealthCheck: new Date(),
                    });
                    return isOnline;
                } catch {
                    set({
                        isOnline: false,
                        lastHealthCheck: new Date(),
                    });
                    return false;
                }
            },

            // Set API URL
            setApiUrl: (url: string) => {
                setApiUrlService(url);
                set({ apiUrl: url });
            },

            // Toggle auto sync
            setAutoSync: (enabled: boolean) => {
                set({ autoSyncEnabled: enabled });
            },

            // Add item to sync queue
            addToQueue: (type, data) => {
                const { queue } = get();
                const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

                const newItem: SyncQueueItem = {
                    id,
                    type,
                    data,
                    createdAt: new Date(),
                    retryCount: 0,
                };

                set({ queue: [...queue, newItem] });
            },

            // Remove item from queue
            removeFromQueue: (id: string) => {
                const { queue } = get();
                set({ queue: queue.filter(item => item.id !== id) });
            },

            // Clear entire queue
            clearQueue: () => {
                set({ queue: [] });
            },


            // Pull updates (Sync Diff)
            pullUpdates: async () => {
                const { lastSyncAt } = get();
                // Check connection first
                if (!await get().checkConnection()) return false;

                try {
                    // getSyncDiff now returns { ts, products, menus } directly
                    const lastSync = lastSyncAt ? lastSyncAt.toISOString() : '1970-01-01T00:00:00.000Z';
                    const result = await getSyncDiff(lastSync);
                    const { ts, products, menus } = result;

                    const imageCache = useImageCacheStore.getState();

                    if (products && products.length > 0) {
                        // Use registered handler
                        const handler = get().productMergeHandler;
                        if (handler) {
                            handler(products);
                            console.log('[Sync] Products merged via handler:', products.length);

                            // Download images for caching (Tauri only)
                            products.forEach(p => {
                                if (p.imagePath) {
                                    // imagePath already contains full URL from backend
                                    imageCache.downloadImage(p.imagePath, p.imagePath)
                                        .catch((err: any) => console.error(`Failed to cache product image ${p.imagePath}:`, err));
                                }
                            });
                        } else {
                            console.warn('[Sync] No product handler registered!');
                        }
                    }

                    if (menus && menus.length > 0) {
                        // Use registered handler
                        const handler = get().menuMergeHandler;
                        if (handler) {
                            handler(menus);
                            console.log('[Sync] Menus merged via handler:', menus.length);

                            // Download images for caching (Tauri only)
                            menus.forEach(m => {
                                if (m.imagePath) {
                                    // imagePath already contains full URL from backend
                                    imageCache.downloadImage(m.imagePath, m.imagePath)
                                        .catch((err: any) => console.error(`Failed to cache menu image ${m.imagePath}:`, err));
                                }
                            });
                        } else {
                            console.warn('[Sync] No menu handler registered!');
                        }
                    }

                    // Handle categories
                    const categories = result.categories || [];
                    if (categories.length > 0) {
                        const handler = get().categoryMergeHandler;
                        if (handler) {
                            handler(categories);
                            console.log('[Sync] Categories merged via handler:', categories.length);
                        } else {
                            console.warn('[Sync] No category handler registered!');
                        }
                    }

                    set({ lastSyncAt: new Date(ts) });
                    return true;
                } catch (e) {
                    console.error("Pull updates failed", e);
                    return false;
                }
            },

            // Sync all pending items
            syncAll: async () => {
                const { isSyncing, checkConnection, pullUpdates } = get();

                if (isSyncing) return;

                // Check connection first
                const online = await checkConnection();
                if (!online) {
                    console.log('[Sync] Server offline, skipping sync');
                    return;
                }

                set({ isSyncing: true });

                try {
                    // 1. Pull latest changes first
                    await pullUpdates();

                    // 2. Push local changes
                    await get().syncEntity('transaction');
                    await get().syncEntity('closure');
                    await get().syncEntity('product');
                    await get().syncEntity('menu');
                    await get().syncEntity('stock_movement');

                    set({ lastSyncAt: new Date() });
                } finally {
                    set({ isSyncing: false });
                }
            },

            // Sync specific entity type
            syncEntity: async (type: SyncEntityType) => {
                const { queue, syncLog } = get();
                const items = queue.filter(item => item.type === type);

                if (items.length === 0) return true;

                const logEntry: SyncLogEntry = {
                    id: `log-${Date.now()}`,
                    type,
                    count: items.length,
                    status: 'success',
                    timestamp: new Date(),
                };

                try {
                    let result: SyncResult | undefined;

                    switch (type) {
                        case 'transaction':
                            result = await syncTransactions(items.map(i => i.data as Transaction));
                            break;
                        case 'closure':
                            result = await syncClosures(items.map(i => i.data as CashClosure));
                            break;
                        case 'product':
                            result = await syncProducts(items.map(i => i.data as Product));
                            break;
                        case 'menu':
                            result = await syncMenus(items.map(i => i.data as Menu));
                            break;
                        case 'stock_movement':
                            result = await syncStockMovements(items.map(i => i.data as StockMovement));
                            break;
                        case 'category':
                            result = await syncCategories(items.map(i => i.data as Category));
                            break;
                    }

                    if (result && result.success) {
                        // Remove synced items from queue
                        const itemIds = items.map(i => i.id);
                        set({
                            queue: get().queue.filter(i => !itemIds.includes(i.id)),
                            syncLog: [logEntry, ...syncLog].slice(0, 50), // Keep last 50 entries
                        });
                        return true;
                    } else {
                        // Increment retry count for failed items
                        logEntry.status = 'error';
                        logEntry.message = result?.error || 'Unknown error';

                        const updatedQueue = get().queue.map(item => {
                            if (items.find(i => i.id === item.id)) {
                                return {
                                    ...item,
                                    retryCount: item.retryCount + 1,
                                    lastError: result?.error || 'Unknown error',
                                };
                            }
                            return item;
                        });

                        set({
                            queue: updatedQueue,
                            syncLog: [logEntry, ...syncLog].slice(0, 50),
                        });
                        return false;
                    }
                } catch (error) {
                    logEntry.status = 'error';
                    logEntry.message = error instanceof Error ? error.message : 'Unknown error';

                    set({
                        syncLog: [logEntry, ...syncLog].slice(0, 50),
                    });
                    return false;
                }
            },

            // Get pending item count
            getPendingCount: () => {
                return get().queue.length;
            },

            // Get queue items by type
            getQueueByType: (type: SyncEntityType) => {
                return get().queue.filter(item => item.type === type);
            },
        }),
        {
            name: 'ma-caisse-sync',
            partialize: (state) => ({
                apiUrl: state.apiUrl,
                autoSyncEnabled: state.autoSyncEnabled,
                queue: state.queue,
                syncLog: state.syncLog.slice(0, 20), // Only persist recent logs
            }),
        }
    )
);

// ===================================
// Auto-sync Hook
// ===================================

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(): void {
    const { syncIntervalMs, autoSyncEnabled } = useSyncStore.getState();

    if (syncInterval) {
        clearInterval(syncInterval);
    }

    if (autoSyncEnabled) {
        // Track previous online state for reconnection detection
        let wasOnline = useSyncStore.getState().isOnline;

        // Initial sync - push local changes and pull updates
        useSyncStore.getState().syncAll();
        useSyncStore.getState().pullUpdates();

        // Periodic sync - check connection and process queue
        syncInterval = setInterval(async () => {
            const state = useSyncStore.getState();
            if (!state.autoSyncEnabled) return;

            // Check connection
            const isNowOnline = await state.checkConnection();

            // Detect reconnection: was offline, now online
            if (!wasOnline && isNowOnline) {
                console.log('[Sync] 🟢 Connection restored! Processing offline queue...');

                // Immediately process queued items
                if (state.queue.length > 0) {
                    console.log(`[Sync] Processing ${state.queue.length} queued items...`);
                    await state.syncAll();
                    console.log('[Sync] ✅ Offline queue processed successfully');
                }

                // Pull latest updates from server
                await state.pullUpdates();
            }

            // Update previous state
            wasOnline = isNowOnline;

            // Regular periodic sync if online
            if (isNowOnline) {
                // Always pull updates from server
                await state.pullUpdates();

                // Push local changes if any
                if (state.queue.length > 0) {
                    await state.syncAll();
                }
            }
        }, syncIntervalMs);
    }
}

export function stopAutoSync(): void {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}
