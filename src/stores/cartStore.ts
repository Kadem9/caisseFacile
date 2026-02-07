// ===================================
// Cart Store - Shopping Cart State
// ===================================

import { create } from 'zustand';
import type { Product, CartItem, Cart } from '../types';

interface CartState extends Cart {
    // Actions
    addItem: (product: Product, quantity?: number, menuComponents?: string[]) => void;
    removeItem: (productId: number) => void;
    updateQuantity: (productId: number, quantity: number) => void;
    incrementItem: (productId: number) => void;
    decrementItem: (productId: number) => void;
    clearCart: () => void;
}

const calculateTotals = (items: CartItem[]): { totalItems: number; totalAmount: number } => {
    return items.reduce(
        (acc, item) => ({
            totalItems: acc.totalItems + item.quantity,
            totalAmount: acc.totalAmount + item.subtotal,
        }),
        { totalItems: 0, totalAmount: 0 }
    );
};

export const useCartStore = create<CartState>((set, get) => ({
    // Initial state
    items: [],
    totalItems: 0,
    totalAmount: 0,

    // Actions
    addItem: (product, quantity = 1, menuComponents) => {
        const { items } = get();
        const existingIndex = items.findIndex(item => item.product.id === product.id);

        let newItems: CartItem[];

        if (existingIndex >= 0) {
            // Update existing item
            newItems = items.map((item, index) =>
                index === existingIndex
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        subtotal: (item.quantity + quantity) * item.product.price,
                    }
                    : item
            );
        } else {
            // Add new item
            newItems = [
                ...items,
                {
                    product,
                    quantity,
                    subtotal: quantity * product.price,
                    menuComponents, // Store menu components for ticket printing
                },
            ];
        }

        set({
            items: newItems,
            ...calculateTotals(newItems),
        });
    },

    removeItem: (productId) => {
        const { items } = get();
        const newItems = items.filter(item => item.product.id !== productId);

        set({
            items: newItems,
            ...calculateTotals(newItems),
        });
    },

    updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
            get().removeItem(productId);
            return;
        }

        const { items } = get();
        const item = items.find(i => i.product.id === productId);

        // Check stock availability
        if (item && quantity > item.product.stockQuantity) {
            alert(`Stock insuffisant pour ${item.product.name}. Il ne reste que ${item.product.stockQuantity} en stock.`);
            return;
        }

        const newItems = items.map(item =>
            item.product.id === productId
                ? {
                    ...item,
                    quantity,
                    subtotal: quantity * item.product.price,
                }
                : item
        );

        set({
            items: newItems,
            ...calculateTotals(newItems),
        });
    },

    incrementItem: (productId) => {
        const { items } = get();
        const item = items.find(i => i.product.id === productId);

        if (item) {
            // Check if we can increment
            if (item.quantity >= item.product.stockQuantity) {
                alert(`Stock insuffisant pour ${item.product.name}. Il ne reste que ${item.product.stockQuantity} en stock.`);
                return;
            }
            get().updateQuantity(productId, item.quantity + 1);
        }
    },

    decrementItem: (productId) => {
        const { items } = get();
        const item = items.find(i => i.product.id === productId);
        if (item && item.quantity > 1) {
            get().updateQuantity(productId, item.quantity - 1);
        } else if (item) {
            get().removeItem(productId);
        }
    },

    clearCart: () => {
        set({
            items: [],
            totalItems: 0,
            totalAmount: 0,
        });
    },
}));
