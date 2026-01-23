// ===================================
// Auth Store - User Authentication State & Management
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserCreateInput } from '../types';
import { useSyncStore } from './syncStore';

interface AuthState {
    // State
    currentUser: User | null;
    isAuthenticated: boolean;
    availableUsers: User[];
    lastUserId: number;

    // Actions
    setAvailableUsers: (users: User[]) => void;
    login: (user: User) => void;
    logout: () => void;

    // CRUD Actions
    addUser: (input: UserCreateInput) => User;
    updateUser: (id: number, updates: Partial<UserCreateInput> & { isActive?: boolean }) => void;
    deleteUser: (id: number) => void;

    // Sync
    mergeServerUsers: (users: User[]) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // Initial state
            currentUser: null,
            isAuthenticated: false,
            availableUsers: [],
            lastUserId: 0,

            // Actions
            setAvailableUsers: (users) => {
                let maxId = 0;
                users.forEach(u => {
                    if (u.id > maxId) maxId = u.id;
                });
                set({ availableUsers: users, lastUserId: maxId });
            },

            login: (user) => set({
                currentUser: user,
                isAuthenticated: true
            }),

            logout: () => set({
                currentUser: null,
                isAuthenticated: false
            }),

            // CRUD Actions
            addUser: (input) => {
                const { lastUserId, availableUsers } = get();
                const newId = lastUserId + 1;
                const now = new Date();

                // Generate pinHash (simple replacement for now as we don't hash on client yet)
                // ideally backend handles hashing, but for offline we store raw or simple hash
                // In this system, it seems we send "pin" and backend stores "pinHash".
                // For offline mock, we'll store the pin as pinHash temporarily.

                const newUser: User = {
                    id: newId,
                    name: input.name,
                    pinHash: input.pin, // Store raw pin temporarily for offline check
                    role: input.role,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now,
                };

                const updatedUsers = [...availableUsers, newUser];

                set({
                    lastUserId: newId,
                    availableUsers: updatedUsers,
                });

                // Sync
                useSyncStore.getState().addToQueue('user', newUser);
                useSyncStore.getState().syncAll().catch(console.error);

                return newUser;
            },

            updateUser: (id, updates) => {
                set((state) => {
                    const users = state.availableUsers.map((u) => {
                        if (u.id !== id) return u;

                        const updatedUser: User = {
                            ...u,
                            name: updates.name ?? u.name,
                            role: updates.role ?? u.role,
                            isActive: updates.isActive ?? u.isActive,
                            // precise pin update handling
                            pinHash: updates.pin ?? u.pinHash,
                            updatedAt: new Date()
                        };

                        // Sync
                        useSyncStore.getState().addToQueue('user', updatedUser);
                        return updatedUser;
                    });

                    useSyncStore.getState().syncAll().catch(console.error);
                    return { availableUsers: users };
                });
            },

            deleteUser: (id) => {
                set((state) => {
                    const user = state.availableUsers.find(u => u.id === id);
                    if (user) {
                        const deletedUser = {
                            ...user,
                            isActive: false,
                            updatedAt: new Date()
                        };

                        useSyncStore.getState().addToQueue('user', deletedUser);
                        useSyncStore.getState().syncAll().catch(console.error);
                    }

                    return {
                        // Soft delete locally too? Or remove?
                        // If we remove locally, we can't login.
                        // But if we deleted it, we shouldn't login.
                        availableUsers: state.availableUsers.filter((u) => u.id !== id)
                    };
                });
            },

            // Sync Merge Handler
            mergeServerUsers: (serverUsers) => {
                set((state) => {
                    let currentUsers = [...state.availableUsers];
                    let maxId = state.lastUserId;
                    let hasChanges = false;

                    serverUsers.forEach(serverUser => {
                        const sUser = serverUser as any;
                        const userId = sUser.localId || sUser.id;

                        if (userId > maxId) maxId = userId;

                        const index = currentUsers.findIndex(u => u.id === userId);

                        if (!serverUser.isActive) {
                            if (index >= 0) {
                                currentUsers = currentUsers.filter(u => u.id !== userId);
                                hasChanges = true;
                            }
                            return;
                        }

                        const mappedUser: User = {
                            ...serverUser,
                            id: userId,
                            createdAt: new Date(serverUser.createdAt),
                            updatedAt: new Date(serverUser.updatedAt || new Date()),
                        };

                        if (index >= 0) {
                            currentUsers[index] = { ...currentUsers[index], ...mappedUser };
                            hasChanges = true;
                        } else {
                            currentUsers.push(mappedUser);
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        return { availableUsers: currentUsers, lastUserId: maxId };
                    }
                    return {};
                });
            },
        }),
        {
            name: 'ma-caisse-auth',
            partialize: (state) => ({
                // Persist current session AND available users for offline access
                currentUser: state.currentUser,
                isAuthenticated: state.isAuthenticated,
                availableUsers: state.availableUsers,
                lastUserId: state.lastUserId,
            }),
        }
    )
);

// Register handler
setTimeout(() => {
    useSyncStore.getState().registerUserHandler(
        useAuthStore.getState().mergeServerUsers
    );
}, 0);
