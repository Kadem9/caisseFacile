// ===================================
// Product Store - Products & Categories State
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, Category, ProductCreateInput, CategoryCreateInput } from '../types';

// Initial mock data for development
const INITIAL_CATEGORIES: Category[] = [
    { id: 1, name: 'Boissons', color: '#3b82f6', icon: '🍺', sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, name: 'Snacks', color: '#f59e0b', icon: '🍿', sortOrder: 2, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 3, name: 'Repas', color: '#10b981', icon: '🍔', sortOrder: 3, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 4, name: 'Desserts', color: '#ec4899', icon: '🍰', sortOrder: 4, isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

const INITIAL_PRODUCTS: Product[] = [
    // Boissons
    { id: 1, categoryId: 1, name: 'Bière 25cl', price: 3.00, stockQuantity: 100, alertThreshold: 20, isActive: true, printTicket: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, categoryId: 1, name: 'Bière 50cl', price: 5.00, stockQuantity: 80, alertThreshold: 15, isActive: true, printTicket: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 3, categoryId: 1, name: 'Coca-Cola', price: 2.50, stockQuantity: 50, alertThreshold: 10, isActive: true, printTicket: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    { id: 4, categoryId: 1, name: 'Eau', price: 1.50, stockQuantity: 100, alertThreshold: 20, isActive: true, printTicket: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
    { id: 5, categoryId: 1, name: 'Café', price: 1.50, stockQuantity: 200, alertThreshold: 30, isActive: true, printTicket: true, sortOrder: 5, createdAt: new Date(), updatedAt: new Date() },
    // Snacks
    { id: 6, categoryId: 2, name: 'Chips', price: 2.00, stockQuantity: 40, alertThreshold: 10, isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 7, categoryId: 2, name: 'Cacahuètes', price: 2.50, stockQuantity: 30, alertThreshold: 10, isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 8, categoryId: 2, name: 'Bonbons', price: 1.00, stockQuantity: 100, alertThreshold: 20, isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    // Repas
    { id: 9, categoryId: 3, name: 'Hot-Dog', price: 4.00, stockQuantity: 25, alertThreshold: 5, isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 10, categoryId: 3, name: 'Sandwich', price: 5.00, stockQuantity: 20, alertThreshold: 5, isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 11, categoryId: 3, name: 'Frites', price: 3.00, stockQuantity: 30, alertThreshold: 10, isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    // Desserts
    { id: 12, categoryId: 4, name: 'Gaufre', price: 3.50, stockQuantity: 15, alertThreshold: 5, isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 13, categoryId: 4, name: 'Crêpe', price: 3.00, stockQuantity: 15, alertThreshold: 5, isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
];

interface ProductState {
    // State
    products: Product[];
    categories: Category[];
    lastProductId: number;
    lastCategoryId: number;

    // Product Actions
    addProduct: (input: ProductCreateInput) => Product;
    updateProduct: (id: number, updates: Partial<ProductCreateInput>) => void;
    deleteProduct: (id: number) => void;
    toggleProductActive: (id: number) => void;

    // Category Actions
    addCategory: (input: CategoryCreateInput) => Category;
    updateCategory: (id: number, updates: Partial<CategoryCreateInput>) => void;
    deleteCategory: (id: number) => void;

    // Stock Actions
    updateStock: (productId: number, quantity: number) => void;
    decrementStock: (productId: number, quantity: number) => void;

    // Generic Bulk Update
    updateAllProductsPrintTicket: (value: boolean) => void;

    // Getters
    getProductsByCategory: (categoryId: number) => Product[];
    getActiveProducts: () => Product[];
    getActiveCategories: () => Category[];
    getLowStockProducts: () => Product[];
    getProductById: (id: number) => Product | undefined;
    getCategoryById: (id: number) => Category | undefined;

    // Upload
    uploadProductImage: (file: File) => Promise<string>;

    // Sync
    mergeServerProducts: (products: Product[]) => void;
    mergeServerCategories: (categories: Category[]) => void;
    reorderCategory: (id: number, direction: 'up' | 'down') => void;
    reorderProduct: (id: number, direction: 'up' | 'down') => void;
}

import { uploadImage } from '../services/api';
import { useSyncStore } from './syncStore';

// Helper function to deduplicate products by ID
const deduplicateProducts = (products: Product[]): Product[] => {
    const seen = new Map<number, Product>();
    products.forEach(product => {
        if (!seen.has(product.id)) {
            seen.set(product.id, product);
        }
    });
    return Array.from(seen.values());
};

export const useProductStore = create<ProductState>()(
    persist(
        (set, get) => ({
            // ... strict state initialization ...
            // Initial state
            products: INITIAL_PRODUCTS,
            categories: INITIAL_CATEGORIES,
            lastProductId: 13,
            lastCategoryId: 4,

            // Product Actions
            addProduct: (input) => {
                const { lastProductId, products } = get();
                const newId = lastProductId + 1;
                const now = new Date();

                const newProduct: Product = {
                    id: newId,
                    categoryId: input.categoryId,
                    name: input.name,
                    price: input.price,
                    stockQuantity: input.stockQuantity ?? 0,
                    alertThreshold: input.alertThreshold ?? 10,
                    isActive: true, // Default to true
                    imagePath: input.imagePath,
                    printTicket: input.printTicket ?? true,
                    sortOrder: input.sortOrder ?? (products.length + 1), // Default to end of list
                    createdAt: now,
                    updatedAt: now,
                };

                set({
                    lastProductId: newId,
                    products: [...products, newProduct],
                });

                useSyncStore.getState().addToQueue('product', newProduct);
                useSyncStore.getState().syncAll().catch(console.error); // Immediate sync attempt

                return newProduct;
            },

            updateProduct: (id, updates) => {
                set((state) => {
                    const products = state.products.map((p) =>
                        p.id === id
                            ? {
                                ...p,
                                ...updates,
                                updatedAt: new Date(),
                            }
                            : p
                    );

                    const updatedProduct = products.find(p => p.id === id);
                    if (updatedProduct) {
                        useSyncStore.getState().addToQueue('product', updatedProduct);
                        useSyncStore.getState().syncAll().catch(console.error); // Immediate sync attempt
                    }

                    return { products };
                });
            },

            deleteProduct: (id) => {
                set((state) => {
                    const product = state.products.find(p => p.id === id);

                    if (product) {
                        // Soft delete: mark as inactive and sync to server
                        // This ensures the deletion is propagated to all machines
                        const deletedProduct = {
                            ...product,
                            isActive: false,
                            updatedAt: new Date()
                        };

                        // Queue the "deleted" product for sync (with isActive: false)
                        useSyncStore.getState().addToQueue('product', deletedProduct);
                        useSyncStore.getState().syncAll().catch(console.error);

                        console.log('[ProductStore] Product soft-deleted and queued for sync:', product.name);
                    }

                    // Remove locally  
                    return {
                        products: state.products.filter((p) => p.id !== id),
                    };
                });
            },

            toggleProductActive: (id) => {
                set((state) => {
                    const products = state.products.map((p) =>
                        p.id === id ? { ...p, isActive: !p.isActive, updatedAt: new Date() } : p
                    );
                    const updatedProduct = products.find(p => p.id === id);
                    if (updatedProduct) {
                        useSyncStore.getState().addToQueue('product', updatedProduct);
                        useSyncStore.getState().syncAll().catch(console.error); // Immediate sync attempt
                    }
                    return { products };
                });
            },

            updateAllProductsPrintTicket: (value) => {
                set((state) => {
                    const products = state.products.map((p) => {
                        // Only update if changed prevents unnecessary syncs?
                        // But simplification: update all.
                        return { ...p, printTicket: value, updatedAt: new Date() };
                    });

                    // Queue all for sync
                    // Note: This might be heavy if hundreds of products. 
                    // Ideally sync store handles bulk, but for now queue individually is safe.
                    const syncStore = useSyncStore.getState();
                    products.forEach(p => {
                        syncStore.addToQueue('product', p);
                    });
                    syncStore.syncAll().catch(console.error);

                    return { products };
                });
            },

            // Category Actions
            addCategory: (input) => {
                const { lastCategoryId, categories } = get();
                const newId = lastCategoryId + 1;
                const now = new Date();

                const newCategory: Category = {
                    id: newId,
                    name: input.name,
                    color: input.color,
                    icon: input.icon,
                    sortOrder: input.sortOrder ?? categories.length + 1,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now,
                };

                set({
                    lastCategoryId: newId,
                    categories: [...categories, newCategory],
                });

                // Trigger sync
                useSyncStore.getState().addToQueue('category', newCategory);
                useSyncStore.getState().syncAll().catch(console.error);

                return newCategory;
            },

            updateCategory: (id, updates) => {
                set((state) => {
                    const categories = state.categories.map((c) =>
                        c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c
                    );

                    const updatedCategory = categories.find(c => c.id === id);
                    if (updatedCategory) {
                        // Trigger sync
                        useSyncStore.getState().addToQueue('category', updatedCategory);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return { categories };
                });
            },

            deleteCategory: (id) => {
                set((state) => {
                    const category = state.categories.find(c => c.id === id);

                    if (category) {
                        // Soft delete: mark as inactive and sync to server
                        // This ensures the deletion is propagated to all machines
                        const deletedCategory = {
                            ...category,
                            isActive: false,
                            updatedAt: new Date()
                        };

                        // Queue the "deleted" category for sync (with isActive: false)
                        useSyncStore.getState().addToQueue('category', deletedCategory);
                        useSyncStore.getState().syncAll().catch(console.error);

                        console.log('[ProductStore] Category soft-deleted and queued for sync:', category.name);
                    }

                    // Remove locally  
                    return {
                        categories: state.categories.filter((c) => c.id !== id),
                    };
                });
            },

            // Stock Actions
            updateStock: (productId, quantity) => {
                set((state) => {
                    const products = state.products.map((p) =>
                        p.id === productId
                            ? { ...p, stockQuantity: quantity, updatedAt: new Date() }
                            : p
                    );

                    const updatedProduct = products.find(p => p.id === productId);
                    if (updatedProduct) {
                        useSyncStore.getState().addToQueue('product', updatedProduct);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return { products };
                });
            },

            decrementStock: (productId, quantity) => {
                set((state) => {
                    const products = state.products.map((p) =>
                        p.id === productId
                            ? {
                                ...p,
                                stockQuantity: Math.max(0, p.stockQuantity - quantity),
                                updatedAt: new Date(),
                            }
                            : p
                    );

                    const updatedProduct = products.find(p => p.id === productId);
                    if (updatedProduct) {
                        useSyncStore.getState().addToQueue('product', updatedProduct);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return { products };
                });
            },

            // Getters
            getProductsByCategory: (categoryId) => {
                return get().products.filter(
                    (p) => p.categoryId === categoryId && p.isActive
                );
            },

            getActiveProducts: () => {
                return get().products.filter((p) => p.isActive);
            },

            getActiveCategories: () => {
                return get()
                    .categories.filter((c) => c.isActive)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
            },

            getLowStockProducts: () => {
                return get().products.filter(
                    (p) => p.isActive && p.stockQuantity <= p.alertThreshold
                );
            },

            getProductById: (id) => {
                return get().products.find((p) => p.id === id);
            },

            getCategoryById: (id) => {
                return get().categories.find((c) => c.id === id);
            },

            uploadProductImage: async (file) => {
                return await uploadImage(file);
            },

            // Silent update for sync (Pull)
            mergeServerProducts: (newProducts) => {
                set((state) => {
                    let currentProducts = [...state.products];
                    let maxId = state.lastProductId; // Start with current max
                    let hasChanges = false;

                    newProducts.forEach(serverProd => {
                        const sp = serverProd as any;
                        const productId = sp.localId || sp.id;

                        // Track max ID
                        if (typeof productId === 'number' && productId > maxId) {
                            maxId = productId;
                        }

                        const index = currentProducts.findIndex(p => p.id === productId);

                        // Map server fields
                        const mappedProd = {
                            ...serverProd,
                            id: productId,
                            categoryId: sp.categoryId || serverProd.categoryId,
                            createdAt: new Date(serverProd.createdAt),
                            updatedAt: new Date(serverProd.updatedAt || new Date()),
                            sortOrder: sp.sortOrder ?? 0,
                            isActive: Boolean(serverProd.isActive)
                        };

                        if (index >= 0) {
                            currentProducts[index] = { ...currentProducts[index], ...mappedProd };
                            hasChanges = true;
                        } else {
                            currentProducts.push(mappedProd as Product);
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        return {
                            products: currentProducts,
                            lastProductId: maxId // Update lastProductId
                        };
                    }

                    // Always update maxId if it increased, even if no content changed
                    return { lastProductId: maxId };
                });
            },

            mergeServerCategories: (newCategories: Category[]) => {
                set((state) => {
                    let currentCategories = [...state.categories];
                    let maxId = state.lastCategoryId;
                    let hasChanges = false;

                    newCategories.forEach(serverCat => {
                        // Cast to any to get potential extra fields if needed, or just strict typing
                        // Assuming newCategories matches Category type but might have server extras
                        const catId = serverCat.id;
                        if (catId > maxId) maxId = catId;

                        const index = currentCategories.findIndex(c => c.id === catId);

                        // If server says category is deleted (isActive: false or not showing up in full sync? partial sync usually sends deletions as updates)
                        // In sync diff, we expect isActive: false for deleted items.
                        // Map server fields
                        const mappedCat: Category = {
                            id: catId,
                            name: serverCat.name,
                            color: serverCat.color || '#6b7280',
                            icon: serverCat.icon || '📦',
                            sortOrder: serverCat.sortOrder ?? 0,
                            isActive: Boolean(serverCat.isActive), // Ensure boolean and persist false
                            createdAt: new Date(serverCat.createdAt),
                            updatedAt: new Date(serverCat.updatedAt || new Date()),
                        };

                        if (index >= 0) {
                            // Update existing
                            currentCategories[index] = { ...currentCategories[index], ...mappedCat };
                            hasChanges = true;
                        } else {
                            // Add new
                            currentCategories.push(mappedCat);
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        // Sort by sortOrder
                        currentCategories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                        console.log('[ProductStore] Categories synced/merged:', currentCategories.length);
                        return {
                            categories: currentCategories,
                            lastCategoryId: maxId
                        };
                    }
                    return {};
                });
            },

            reorderCategory: (id: number, direction: 'up' | 'down') => {
                set((state) => {
                    // 1. Sort by current order (handle ties deterministically using ID)
                    const sortedCategories = [...state.categories].sort((a, b) => {
                        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
                        if (orderDiff !== 0) return orderDiff;
                        return a.id - b.id;
                    });

                    const currentIndex = sortedCategories.findIndex(c => c.id === id);
                    if (currentIndex === -1) return {};

                    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

                    // Bounds check
                    if (targetIndex < 0 || targetIndex >= sortedCategories.length) return {};

                    // 2. Move element in the array
                    const [movedCategory] = sortedCategories.splice(currentIndex, 1);
                    sortedCategories.splice(targetIndex, 0, movedCategory);

                    // 3. Re-assign sortOrder 1 to N for ALL categories to ensure consistency
                    const syncStore = useSyncStore.getState();

                    const updatedCategories = sortedCategories.map((cat, index) => {
                        const newOrder = index + 1;
                        if (cat.sortOrder !== newOrder) {
                            const updated = {
                                ...cat,
                                sortOrder: newOrder,
                                updatedAt: new Date()
                            };
                            // Queue for sync only if changed
                            syncStore.addToQueue('category', updated);
                            return updated;
                        }
                        return cat;
                    });

                    syncStore.syncAll().catch(console.error);

                    return { categories: updatedCategories };
                });
            },

            reorderProduct: (id: number, direction: 'up' | 'down') => {
                set((state) => {
                    const productToMove = state.products.find(p => p.id === id);
                    if (!productToMove) return {};

                    // Filter products by the SAME category to order within that scope
                    const categoryProducts = state.products
                        .filter(p => p.categoryId === productToMove.categoryId && p.isActive) // Maybe include inactive? user usually reorders active view
                        .sort((a, b) => {
                            const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
                            if (orderDiff !== 0) return orderDiff;
                            return a.id - b.id;
                        });

                    const currentIndex = categoryProducts.findIndex(p => p.id === id);
                    if (currentIndex === -1) return {};

                    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

                    // Bounds check
                    if (targetIndex < 0 || targetIndex >= categoryProducts.length) return {};

                    // Swap in the local filtered array to calculate new sortOrders
                    const [movedProduct] = categoryProducts.splice(currentIndex, 1);
                    categoryProducts.splice(targetIndex, 0, movedProduct);

                    // Re-assign sort orders
                    const syncStore = useSyncStore.getState();
                    const updates = new Map<number, number>();

                    categoryProducts.forEach((prod, index) => {
                        const newOrder = index + 1;
                        if (prod.sortOrder !== newOrder) {
                            updates.set(prod.id, newOrder);
                        }
                    });

                    // Update the main state
                    const updatedProducts = state.products.map(p => {
                        if (updates.has(p.id)) {
                            const newOrder = updates.get(p.id)!;
                            const updated = { ...p, sortOrder: newOrder, updatedAt: new Date() };
                            syncStore.addToQueue('product', updated);
                            return updated;
                        }
                        return p;
                    });

                    syncStore.syncAll().catch(console.error);

                    return { products: updatedProducts };
                });
            },
        }),
        {
            name: 'ma-caisse-products',
            partialize: (state) => ({
                products: state.products,
                categories: state.categories,
                lastProductId: state.lastProductId,
                lastCategoryId: state.lastCategoryId,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Deduplicate products on load to fix any corruption
                    state.products = deduplicateProducts(state.products);

                    // Migration: Ensure sortOrder exists
                    let needUpdate = false;
                    const migrated = state.products.map((p, index) => {
                        if (typeof p.sortOrder === 'undefined') {
                            needUpdate = true;
                            return { ...p, sortOrder: index + 1 };
                        }
                        return p;
                    });

                    if (needUpdate) {
                        state.products = migrated;
                    }
                }
            },
        }
    )
);

// Register handler to avoid circular dependency
// We do this safely to ensure both stores are initialized
setTimeout(() => {
    useSyncStore.getState().registerProductHandler(
        useProductStore.getState().mergeServerProducts
    );
    useSyncStore.getState().registerCategoryHandler(
        useProductStore.getState().mergeServerCategories
    );
}, 0);
