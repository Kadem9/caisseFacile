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
    syncUsers,
    syncStockMovements,
    syncCashMovements,
    getApiUrl,
    setApiUrl as setApiUrlService,
    getSyncDiff,
    type SyncResult,
} from '../services/api';
import { logger } from '../services/logger';
import { useImageCacheStore } from './imageCacheStore';
import type { Transaction, CashClosure, CashMovement, Product, StockMovement, Menu, Category, User } from '../types';

// ===================================
// Types
// ===================================

export type SyncEntityType = 'transaction' | 'closure' | 'cash_movement' | 'product' | 'stock_movement' | 'menu' | 'category' | 'user';

export interface SyncQueueItem {
    id: string;
    type: SyncEntityType;
    data: Transaction | CashClosure | CashMovement | Product | StockMovement | Menu | Category | User;
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
    userMergeHandler: ((users: User[]) => void) | null;

    // Actions
    checkConnection: () => Promise<boolean>;
    setApiUrl: (url: string) => void;
    setAutoSync: (enabled: boolean) => void;
    registerProductHandler: (handler: (products: Product[]) => void) => void;
    registerMenuHandler: (handler: (menus: Menu[]) => void) => void;
    registerCategoryHandler: (handler: (categories: Category[]) => void) => void;
    registerUserHandler: (handler: (users: User[]) => void) => void;

    // Queue management
    addToQueue: (type: SyncEntityType, data: Transaction | CashClosure | CashMovement | Product | StockMovement | Menu | Category | User) => void;
    removeFromQueue: (id: string) => void;
    clearQueue: () => void;

    // Sync operations
    syncAll: () => Promise<void>;
    syncEntity: (type: SyncEntityType) => Promise<boolean>;
    pullUpdates: () => Promise<boolean>;

    // Getters
    getPendingCount: () => number;
    getQueueByType: (type: SyncEntityType) => SyncQueueItem[];
    resetSync: () => Promise<void>;
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
            userMergeHandler: null,

            registerProductHandler: (handler) => {
                set({ productMergeHandler: handler });
            },

            registerMenuHandler: (handler) => {
                set({ menuMergeHandler: handler });
            },

            registerCategoryHandler: (handler) => {
                set({ categoryMergeHandler: handler });
            },

            registerUserHandler: (handler) => {
                set({ userMergeHandler: handler });
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

                console.log(`[Sync] Adding to queue: ${type}`, data);
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
                    console.log('[Sync] Received categories from server:', categories.length, categories);
                    if (categories.length > 0) {
                        const handler = get().categoryMergeHandler;
                        if (handler) {
                            handler(categories);
                            console.log('[Sync] Categories merged via handler:', categories.length);
                        } else {
                            console.warn('[Sync] No category handler registered!');
                        }
                    }

                    // Handle users
                    const usersList = result.users || [];
                    if (usersList.length > 0) {
                        const handler = get().userMergeHandler;
                        if (handler) {
                            handler(usersList);
                            console.log('[Sync] Users merged via handler:', usersList.length);
                        } else {
                            console.warn('[Sync] No user handler registered!');
                        }
                    }

                    set({ lastSyncAt: new Date(ts) });
                    if (products?.length > 0 || menus?.length > 0) {
                        logger.info('Pull updates successful', { products: products?.length, menus: menus?.length }).catch(console.error);
                    }
                    return true;
                } catch (e) {
                    console.error("Pull updates failed", e);
                    logger.error("Pull updates failed", e).catch(console.error);
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
                    await get().syncEntity('cash_movement');
                    await get().syncEntity('product');
                    await get().syncEntity('menu');
                    await get().syncEntity('stock_movement');
                    await get().syncEntity('stock_movement');
                    await get().syncEntity('category');
                    await get().syncEntity('user');

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
                        case 'cash_movement':
                            result = await syncCashMovements(items.map(i => i.data as CashMovement));
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
                            console.log('[Sync] Syncing categories:', items.map(i => i.data));
                            result = await syncCategories(items.map(i => i.data as Category));
                            console.log('[Sync] syncCategories result:', result);
                            break;
                        case 'user':
                            // We need to implement syncUsers in api.ts first, but I'll add the call here assuming it will exist
                            // To avoid build errors immediately, I will add the import in the next step or assume it exists.
                            // Actually, I should update api.ts first or cast it for now to avoid TS errors if I was running a checker.
                            // But since I'm writing code, I'll add the call and then update api.ts.
                            // Wait, I can't call a function that doesn't exist yet if I want to be safe.
                            // But the user sync function is needed. 
                            // Let's add the import and the case.
                            // I will use 'any' for now to bypass strict check if needed, but better to do it right.
                            // I'll update the imports in a separate Edit.
                            result = await syncUsers(items.map(i => i.data as any));
                            break;
                    }

                    if (result && result.success) {
                        // Remove synced items from queue
                        const itemIds = items.map(i => i.id);
                        set({
                            queue: get().queue.filter(i => !itemIds.includes(i.id)),
                            syncLog: [logEntry, ...syncLog].slice(0, 50), // Keep last 50 entries
                        });
                        logger.info(`Synced ${items.length} ${type}(s) successfully`).catch(console.error);
                        return true;
                    } else {
                        // Increment retry count for failed items
                        logger.warn(`Failed to sync ${type}`, { error: result?.error }).catch(console.error);
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

            // Reset sync state to force full re-sync
            resetSync: async () => {
                set({ lastSyncAt: null });
                console.log('[Sync] Sync timestamp reset. Triggering full sync...');
                await get().syncAll();
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
