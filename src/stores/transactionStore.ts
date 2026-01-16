// ===================================
// Transaction Store - Sales & Transaction State
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Transaction, CartItem, PaymentMethod } from '../types';

interface TransactionState {
    // State
    transactions: Transaction[];
    currentSessionTransactions: Transaction[];
    lastTransactionId: number;

    // Actions
    addTransaction: (
        userId: number,
        items: CartItem[],
        totalAmount: number,
        paymentMethod: PaymentMethod,
        cashReceived?: number,
        changeGiven?: number
    ) => Transaction;

    getTransactionById: (id: number) => Transaction | undefined;
    getTodayTransactions: () => Transaction[];
    getTodayTotal: () => number;
    getSessionTotal: () => number;
    clearSessionTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>()(
    persist(
        (set, get) => ({
            // Initial state
            transactions: [],
            currentSessionTransactions: [],
            lastTransactionId: 0,

            // Actions
            addTransaction: (userId, items, totalAmount, paymentMethod, cashReceived, changeGiven) => {
                const { lastTransactionId, transactions, currentSessionTransactions } = get();

                const newTransactionId = lastTransactionId + 1;

                const transactionItems: any[] = items.map((item, index) => ({
                    id: newTransactionId * 1000 + index,
                    transactionId: newTransactionId,
                    productId: item.product.id,
                    quantity: item.quantity,
                    unitPrice: item.product.price,
                    subtotal: item.subtotal,
                }));

                const newTransaction: Transaction = {
                    id: newTransactionId,
                    userId,
                    createdAt: new Date(),
                    totalAmount,
                    paymentMethod,
                    cashReceived,
                    changeGiven,
                    items: transactionItems,
                    isSynced: false,
                };

                set({
                    lastTransactionId: newTransactionId,
                    transactions: [...transactions, newTransaction],
                    currentSessionTransactions: [...currentSessionTransactions, newTransaction],
                });

                return newTransaction;
            },

            getTransactionById: (id) => {
                return get().transactions.find(t => t.id === id);
            },

            getTodayTransactions: () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                return get().transactions.filter(t => {
                    const transactionDate = new Date(t.createdAt);
                    transactionDate.setHours(0, 0, 0, 0);
                    return transactionDate.getTime() === today.getTime();
                });
            },

            getTodayTotal: () => {
                return get().getTodayTransactions().reduce((sum, t) => sum + t.totalAmount, 0);
            },

            getSessionTotal: () => {
                return get().currentSessionTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
            },

            clearSessionTransactions: () => {
                set({ currentSessionTransactions: [] });
            },
        }),
        {
            name: 'ma-caisse-transactions',
            partialize: (state) => ({
                transactions: state.transactions,
                lastTransactionId: state.lastTransactionId,
            }),
        }
    )
);
