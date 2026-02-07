// ===================================
// Cart Store - Shopping Cart State
// ===================================

import { create } from 'zustand';
import type { Product, CartItem, Cart } from '../types';

interface CartState extends Cart {
    // Actions
    addItem: (product: Product, quantity?: number, menuComponents?: string[]) => void;
    removeItem: (cartItemId: string) => void;
    updateQuantity: (cartItemId: string, quantity: number) => void;
    incrementItem: (cartItemId: string) => void;
    decrementItem: (cartItemId: string) => void;
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

// Simple ID generator if crypto.randomUUID is not available (older browsers/environments)
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const useCartStore = create<CartState>((set, get) => ({
    // Initial state
    items: [],
    totalItems: 0,
    totalAmount: 0,

    // Actions
    addItem: (product, quantity = 1, menuComponents) => {
        const { items } = get();

        // Find existing item with same ID AND same menu components (if applicable)
        const existingIndex = items.findIndex(item => {
            if (item.product.id !== product.id) return false;

            // Compare menu components
            if (!!item.menuComponents !== !!menuComponents) return false;

            if (item.menuComponents && menuComponents) {
                if (item.menuComponents.length !== menuComponents.length) return false;

                const sortedItemComps = [...item.menuComponents].sort().join('|');
                const sortedNewComps = [...menuComponents].sort().join('|');
                return sortedItemComps === sortedNewComps;
            }

            return true;
        });

        let newItems: CartItem[];

        if (existingIndex >= 0) {
            // Update existing item - Preserve the original cartItemId
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
            // Add new item with NEW cartItemId
            newItems = [
                ...items,
                {
                    cartItemId: generateId(),
                    product,
                    quantity,
                    subtotal: quantity * product.price,
                    menuComponents,
                },
            ];
        }

        set({
            items: newItems,
            ...calculateTotals(newItems),
        });
    },

    removeItem: (cartItemId) => {
        const { items } = get();
        const newItems = items.filter(item => item.cartItemId !== cartItemId);

        set({
            items: newItems,
            ...calculateTotals(newItems),
        });
    },

    updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
            get().removeItem(cartItemId);
            return;
        }

        const { items } = get();
        const item = items.find(i => i.cartItemId === cartItemId);

        // Check stock availability
        if (item && quantity > item.product.stockQuantity) {
            alert(`Stock insuffisant pour ${item.product.name}. Il ne reste que ${item.product.stockQuantity} en stock.`);
            return;
        }

        const newItems = items.map(item =>
            item.cartItemId === cartItemId
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

    incrementItem: (cartItemId) => {
        const { items } = get();
        const item = items.find(i => i.cartItemId === cartItemId);

        if (item) {
            // Check stock
            if (item.quantity >= item.product.stockQuantity) {
                alert(`Stock insuffisant pour ${item.product.name}. Il ne reste que ${item.product.stockQuantity} en stock.`);
                return;
            }
            get().updateQuantity(cartItemId, item.quantity + 1);
        }
    },

    decrementItem: (cartItemId) => {
        const { items } = get();
        const item = items.find(i => i.cartItemId === cartItemId);
        if (item && item.quantity > 1) {
            get().updateQuantity(cartItemId, item.quantity - 1);
        } else if (item) {
            get().removeItem(cartItemId);
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
