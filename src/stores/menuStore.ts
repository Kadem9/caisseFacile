// ===================================
// Menu Store - Menu Management State
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Menu, MenuCreateInput } from '../types';

interface MenuState {
    menus: Menu[];
    lastMenuId: number;

    // Actions
    addMenu: (input: MenuCreateInput) => Menu;
    updateMenu: (id: number, updates: Partial<MenuCreateInput>) => void;
    deleteMenu: (id: number) => void;
    toggleMenuActive: (id: number) => void;
    getActiveMenus: () => Menu[];
    getMenuById: (id: number) => Menu | undefined;

    // Sync
    mergeServerMenus: (menus: Menu[]) => void;
}

import { useSyncStore } from './syncStore';

export const useMenuStore = create<MenuState>()(
    persist(
        (set, get) => ({
            menus: [],
            lastMenuId: 0,

            addMenu: (input) => {
                const { lastMenuId, menus } = get();
                const newId = lastMenuId + 1;
                const now = new Date();

                const newMenu: Menu = {
                    id: newId,
                    name: input.name,
                    description: input.description,
                    price: input.price,
                    imagePath: input.imagePath,
                    isActive: true,
                    components: input.components.map((comp, index) => ({
                        id: newId * 1000 + index, // Simple ID generation
                        menuId: newId,
                        categoryId: comp.categoryId,
                        label: comp.label,
                        quantity: comp.quantity,
                        isRequired: comp.isRequired,
                        allowedProductIds: comp.allowedProductIds,
                    })),
                    createdAt: now,
                    updatedAt: now,
                };

                set({
                    lastMenuId: newId,
                    menus: [...menus, newMenu],
                });

                useSyncStore.getState().addToQueue('menu', newMenu);
                useSyncStore.getState().syncAll().catch(console.error);

                return newMenu;
            },

            updateMenu: (id, updates) => {
                set((state) => {
                    const menus = state.menus.map((menu) =>
                        menu.id === id
                            ? {
                                ...menu,
                                ...updates,
                                components: updates.components
                                    ? updates.components.map((comp, index) => ({
                                        id: id * 1000 + index,
                                        menuId: id,
                                        categoryId: comp.categoryId,
                                        label: comp.label,
                                        quantity: comp.quantity,
                                        isRequired: comp.isRequired,
                                        allowedProductIds: comp.allowedProductIds,
                                    }))
                                    : menu.components,
                                updatedAt: new Date(),
                            }
                            : menu
                    );

                    const updatedMenu = menus.find(m => m.id === id);
                    if (updatedMenu) {
                        useSyncStore.getState().addToQueue('menu', updatedMenu);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return { menus };
                });
            },

            deleteMenu: (id) => {
                set((state) => {
                    const menu = state.menus.find(m => m.id === id);

                    if (menu) {
                        // Soft delete: mark as inactive and sync to server
                        const deletedMenu = {
                            ...menu,
                            isActive: false,
                            updatedAt: new Date()
                        };

                        useSyncStore.getState().addToQueue('menu', deletedMenu);
                        useSyncStore.getState().syncAll().catch(console.error);

                        console.log('[MenuStore] Menu soft-deleted and queued for sync:', menu.name);
                    }

                    // Remove locally  
                    return {
                        menus: state.menus.filter((m) => m.id !== id),
                    };
                });
            },

            toggleMenuActive: (id) => {
                set((state) => {
                    const menus = state.menus.map((menu) =>
                        menu.id === id
                            ? { ...menu, isActive: !menu.isActive, updatedAt: new Date() }
                            : menu
                    );

                    const updatedMenu = menus.find(m => m.id === id);
                    if (updatedMenu) {
                        useSyncStore.getState().addToQueue('menu', updatedMenu);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return { menus };
                });
            },

            getActiveMenus: () => {
                return get().menus.filter((menu) => menu.isActive);
            },

            getMenuById: (id) => {
                return get().menus.find((menu) => menu.id === id);
            },

            mergeServerMenus: (newMenus) => {
                set((state) => {
                    let currentMenus = [...state.menus];
                    let hasChanges = false;

                    newMenus.forEach(serverMenu => {
                        const sm = serverMenu as any;
                        const menuId = sm.localId || sm.id;
                        const index = currentMenus.findIndex(m => m.id === menuId);

                        // If server says menu is deleted (isActive: false), remove it locally
                        if (!serverMenu.isActive) {
                            if (index >= 0) {
                                console.log('[Sync Merge] Deleting menu (isActive=false):', sm.name);
                                currentMenus = currentMenus.filter(m => m.id !== menuId);
                                hasChanges = true;
                            }
                            return; // Don't add deleted menus
                        }

                        const mappedMenu = {
                            ...serverMenu,
                            id: menuId,
                            createdAt: new Date(serverMenu.createdAt),
                            updatedAt: new Date(serverMenu.updatedAt || new Date()),
                            isActive: true // Only active menus reach here
                        };

                        if (index >= 0) {
                            currentMenus[index] = { ...currentMenus[index], ...mappedMenu };
                            hasChanges = true;
                        } else {
                            currentMenus.push(mappedMenu as Menu);
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        return { menus: currentMenus };
                    }
                    return {};
                });
            },
        }),
        {
            name: 'ma-caisse-menus',
            partialize: (state) => ({
                menus: state.menus,
                lastMenuId: state.lastMenuId,
            }),
        }
    )
);

// Register handler to avoid circular dependency
setTimeout(() => {
    useSyncStore.getState().registerMenuHandler(
        useMenuStore.getState().mergeServerMenus
    );
}, 0);
