// ===================================
// Closure Store - Cash Closure Management
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CashClosure, CashMovement } from '../types';
import { useSyncStore } from './syncStore';

interface CashClosureInput {
    userId: number;
    initialAmount: number;
}

interface CashClosureCloseInput {
    actualAmount: number;
    notes?: string;
}

interface CashMovementInput {
    userId: number;
    type: 'withdrawal' | 'deposit';
    amount: number;
    reason?: string;
}

interface ClosureState {
    // State
    closures: CashClosure[];
    currentClosure: CashClosure | null;
    movements: CashMovement[]; // Local movements
    lastClosureId: number;
    lastMovementId: number;

    // Actions
    openClosure: (input: CashClosureInput) => CashClosure;
    closeClosure: (input: CashClosureCloseInput) => CashClosure | null;
    addMovement: (input: CashMovementInput) => CashMovement | null;
    updateExpectedAmount: (amount: number) => void;
    clearAllClosures: () => void;

    // Getters
    getCurrentClosure: () => CashClosure | null;
    getClosuresByUser: (userId: number) => CashClosure[];
    getTodayClosures: () => CashClosure[];
    getClosureHistory: (limit: number) => CashClosure[];
    isClosureOpen: () => boolean;
    getCurrentSessionMovements: () => CashMovement[];
}

const getDeviceName = () => {
    if (typeof localStorage !== 'undefined') {
        const config = localStorage.getItem('ma-caisse-hardware-config');
        // ma-caisse-device-name is set in SettingsPage
        return localStorage.getItem('ma-caisse-device-name') || 'Caisse Principale';
    }
    return 'Caisse Principale';
};

export const useClosureStore = create<ClosureState>()(
    persist(
        (set, get) => ({
            // Initial state
            closures: [],
            currentClosure: null,
            movements: [],
            lastClosureId: 0,
            lastMovementId: 0,

            // Actions

            // Actions


            openClosure: (input) => {
                const { lastClosureId, closures } = get();
                const newId = lastClosureId + 1;

                const newClosure: CashClosure = {
                    id: newId,
                    userId: input.userId,
                    openedAt: new Date().toISOString(), // Use ISO string for consistency
                    initialAmount: input.initialAmount,
                    expectedAmount: input.initialAmount,
                    isSynced: false,
                    deviceName: getDeviceName(),
                };

                set({
                    lastClosureId: newId,
                    closures: [...closures, newClosure],
                    currentClosure: newClosure,
                });

                // Sync
                if (useSyncStore.getState().autoSyncEnabled) {
                    useSyncStore.getState().addToQueue('closure', newClosure);
                } else {
                    useSyncStore.getState().addToQueue('closure', newClosure);
                }

                return newClosure;
            },

            closeClosure: (input) => {
                const { currentClosure, closures } = get();
                if (!currentClosure) return null;

                const closedClosure: CashClosure = {
                    ...currentClosure,
                    closedAt: new Date().toISOString(),
                    actualAmount: input.actualAmount,
                    difference: input.actualAmount - currentClosure.expectedAmount,
                    notes: input.notes,
                };

                set({
                    closures: closures.map((c) =>
                        c.id === currentClosure.id ? closedClosure : c
                    ),
                    currentClosure: null,
                });

                // Sync
                useSyncStore.getState().addToQueue('closure', closedClosure);

                return closedClosure;
            },

            addMovement: (input) => {
                const { currentClosure, movements, lastMovementId } = get();
                if (!currentClosure) return null;

                const newId = lastMovementId + 1;
                const newMovement: CashMovement = {
                    id: newId,
                    closureId: currentClosure.id,
                    userId: input.userId,
                    type: input.type,
                    amount: input.amount,
                    reason: input.reason,
                    createdAt: new Date().toISOString(),
                    isSynced: false,
                    deviceName: getDeviceName(),
                };

                // Update expected amount
                const amountChange = input.type === 'deposit' ? input.amount : -input.amount;
                const updatedClosure = {
                    ...currentClosure,
                    expectedAmount: currentClosure.expectedAmount + amountChange
                };

                // Update closure expected amount immediately
                const { closures } = get();
                set({
                    movements: [...movements, newMovement],
                    lastMovementId: newId,
                    currentClosure: updatedClosure,
                    closures: closures.map(c => c.id === updatedClosure.id ? updatedClosure : c)
                });

                // Sync
                useSyncStore.getState().addToQueue('cash_movement', newMovement);
                useSyncStore.getState().addToQueue('closure', updatedClosure);

                return newMovement;
            },

            updateExpectedAmount: (amount) => {
                const { currentClosure, closures } = get();
                if (!currentClosure) return;

                const updatedClosure = {
                    ...currentClosure,
                    expectedAmount: currentClosure.expectedAmount + amount,
                };

                set({
                    currentClosure: updatedClosure,
                    closures: closures.map((c) =>
                        c.id === currentClosure.id ? updatedClosure : c
                    ),
                });
            },

            clearAllClosures: () => {
                set({
                    closures: [],
                    currentClosure: null,
                    movements: [],
                    lastClosureId: 0,
                    lastMovementId: 0
                });
            },

            // Getters
            getCurrentClosure: () => get().currentClosure,

            getClosuresByUser: (userId) => {
                return get()
                    .closures.filter((c) => c.userId === userId)
                    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
            },

            getTodayClosures: () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                return get().closures.filter((c) => {
                    const closureDate = new Date(c.openedAt);
                    closureDate.setHours(0, 0, 0, 0);
                    return closureDate.getTime() === today.getTime();
                });
            },

            getClosureHistory: (limit) => {
                return get()
                    .closures.filter((c) => c.closedAt != null)
                    .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())
                    .slice(0, limit);
            },

            isClosureOpen: () => get().currentClosure !== null,

            getCurrentSessionMovements: () => {
                const { currentClosure, movements } = get();
                if (!currentClosure) return [];
                return movements.filter(m => m.closureId === currentClosure.id);
            }
        }),
        {
            name: 'ma-caisse-closures',
            partialize: (state) => ({
                closures: state.closures,
                currentClosure: state.currentClosure,
                movements: state.movements,
                lastClosureId: state.lastClosureId,
                lastMovementId: state.lastMovementId,
            }),
        }
    )
);
