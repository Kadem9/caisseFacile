// ===================================
// Type Definitions - POS Cart & UI State
// ===================================

import type { Product, PaymentMethod } from './database';

// ===================================
// Cart Types
// ===================================
export interface CartItem {
    product: Product;
    quantity: number;
    subtotal: number;
    /** For menus: list of individual product names to print as separate tickets */
    menuComponents?: string[];
}

export interface Cart {
    items: CartItem[];
    totalItems: number;
    totalAmount: number;
}

// ===================================
// Payment Types
// ===================================
export interface PaymentInfo {
    method: PaymentMethod;
    cashReceived?: number;
    cardAmount?: number;
    changeGiven?: number;
}

// ===================================
// UI State Types
// ===================================
export type AppView =
    | 'login'
    | 'pos'
    | 'products'
    | 'stock'
    | 'reports'
    | 'closure'
    | 'settings';

export interface Notification {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
}

// ===================================
// Statistics Types
// ===================================
export interface DailySummary {
    date: Date;
    totalSales: number;
    totalTransactions: number;
    totalCash: number;
    totalCard: number;
    averageTransaction: number;
}

export interface ProductSalesSummary {
    productId: number;
    productName: string;
    quantitySold: number;
    totalRevenue: number;
}

export interface CategorySalesSummary {
    categoryId: number;
    categoryName: string;
    totalSales: number;
    totalRevenue: number;
}

// ===================================
// Sync Types
// ===================================
export interface SyncStatus {
    lastSyncAt?: Date;
    pendingItems: number;
    isOnline: boolean;
    isSyncing: boolean;
}

export interface SyncQueueItem {
    id: string;
    type: 'transaction' | 'closure' | 'stock_movement';
    data: unknown;
    createdAt: Date;
    retryCount: number;
}
