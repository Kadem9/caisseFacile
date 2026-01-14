// ===================================
// Stock Store - Stock Movements & History
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StockMovement, StockMovementType } from '../types';

interface StockMovementInput {
    productId: number;
    userId: number;
    type: StockMovementType;
    quantity: number;
    reason?: string;
}

interface StockState {
    // State
    movements: StockMovement[];
    lastMovementId: number;

    // Actions
    addMovement: (input: StockMovementInput) => StockMovement;

    // Getters
    getMovementsByProduct: (productId: number) => StockMovement[];
    getMovementsByDate: (date: Date) => StockMovement[];
    getTodayMovements: () => StockMovement[];
    getRecentMovements: (limit: number) => StockMovement[];
}

export const useStockStore = create<StockState>()(
    persist(
        (set, get) => ({
            // Initial state
            movements: [],
            lastMovementId: 0,

            // Actions
            addMovement: (input) => {
                const { lastMovementId, movements } = get();
                const newId = lastMovementId + 1;

                const newMovement: StockMovement = {
                    id: newId,
                    productId: input.productId,
                    userId: input.userId,
                    type: input.type,
                    quantity: input.quantity,
                    reason: input.reason,
                    createdAt: new Date(),
                    isSynced: false,
                };

                set({
                    lastMovementId: newId,
                    movements: [...movements, newMovement],
                });

                return newMovement;
            },

            // Getters
            getMovementsByProduct: (productId) => {
                return get()
                    .movements.filter((m) => m.productId === productId)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            },

            getMovementsByDate: (date) => {
                const targetDate = new Date(date);
                targetDate.setHours(0, 0, 0, 0);

                return get().movements.filter((m) => {
                    const movementDate = new Date(m.createdAt);
                    movementDate.setHours(0, 0, 0, 0);
                    return movementDate.getTime() === targetDate.getTime();
                });
            },

            getTodayMovements: () => {
                return get().getMovementsByDate(new Date());
            },

            getRecentMovements: (limit) => {
                return get()
                    .movements
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, limit);
            },
        }),
        {
            name: 'ma-caisse-stock',
            partialize: (state) => ({
                movements: state.movements,
                lastMovementId: state.lastMovementId,
            }),
        }
    )
);
