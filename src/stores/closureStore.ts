// ===================================
// Closure Store - Cash Closure Management
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CashClosure } from '../types';

interface CashClosureInput {
    userId: number;
    expectedAmount: number;
}

interface CashClosureCloseInput {
    actualAmount: number;
    notes?: string;
}

interface ClosureState {
    // State
    closures: CashClosure[];
    currentClosure: CashClosure | null;
    lastClosureId: number;

    // Actions
    openClosure: (input: CashClosureInput) => CashClosure;
    closeClosure: (input: CashClosureCloseInput) => CashClosure | null;
    updateExpectedAmount: (amount: number) => void;

    // Getters
    getCurrentClosure: () => CashClosure | null;
    getClosuresByUser: (userId: number) => CashClosure[];
    getTodayClosures: () => CashClosure[];
    getClosureHistory: (limit: number) => CashClosure[];
    isClosureOpen: () => boolean;
}

export const useClosureStore = create<ClosureState>()(
    persist(
        (set, get) => ({
            // Initial state
            closures: [],
            currentClosure: null,
            lastClosureId: 0,

            // Actions
            openClosure: (input) => {
                const { lastClosureId, closures } = get();
                const newId = lastClosureId + 1;

                const newClosure: CashClosure = {
                    id: newId,
                    userId: input.userId,
                    openedAt: new Date(),
                    expectedAmount: input.expectedAmount,
                    isSynced: false,
                };

                set({
                    lastClosureId: newId,
                    closures: [...closures, newClosure],
                    currentClosure: newClosure,
                });

                return newClosure;
            },

            closeClosure: (input) => {
                const { currentClosure, closures } = get();
                if (!currentClosure) return null;

                const closedClosure: CashClosure = {
                    ...currentClosure,
                    closedAt: new Date(),
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

                return closedClosure;
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
        }),
        {
            name: 'ma-caisse-closures',
            partialize: (state) => ({
                closures: state.closures,
                currentClosure: state.currentClosure,
                lastClosureId: state.lastClosureId,
            }),
        }
    )
);
