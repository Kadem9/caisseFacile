// ===================================
// API Service - HTTP Client Configuration
// ===================================

export const DEFAULT_API_URL = 'https://api.caissefacile.asmanissieux.fr';

// Get API URL from localStorage or use default
export function getApiUrl(): string {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('ma-caisse-api-url') || DEFAULT_API_URL;
    }
    return DEFAULT_API_URL;
}

export function setApiUrl(url: string): void {
    if (!url || url.trim() === '') {
        localStorage.removeItem('ma-caisse-api-url');
    } else {
        localStorage.setItem('ma-caisse-api-url', url.trim());
    }
}

// API Response types
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    count?: number;
}

export interface SyncResult {
    success: boolean;
    count: number;
    message?: string;
    error?: string;
}

// Generic fetch wrapper with error handling
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const url = `${getApiUrl()}${endpoint}`;

    try {
        // Merge default headers, allowing options.headers to override or omit 'Content-Type'
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const response = await fetch(url, {
            ...options,
            headers: headers,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
                success: false,
                error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
            };
        }

        const data = await response.json();
        return {
            success: true,
            data,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

// ===================================
// Health Check
// ===================================

export async function checkHealth(): Promise<boolean> {
    const result = await apiRequest<{ status: string }>('/api/health');
    return result.success && result.data?.status === 'ok';
}

// ===================================
// Sync Endpoints
// ===================================

import type { Transaction, CashClosure, Product, StockMovement, Menu } from '../types';
import type { PaymentMethod } from '../types/database';

export async function syncTransactions(transactions: Transaction[]): Promise<SyncResult> {
    const result = await apiRequest<SyncResult>('/api/sync/transactions', {
        method: 'POST',
        body: JSON.stringify({ transactions }),
    });

    if (result.success && result.data) {
        return result.data;
    }

    return {
        success: false,
        count: 0,
        error: result.error || 'Unknown error',
    };
}

export async function syncClosures(closures: CashClosure[]): Promise<SyncResult> {
    const result = await apiRequest<SyncResult>('/api/sync/closures', {
        method: 'POST',
        body: JSON.stringify({ closures }),
    });

    if (result.success && result.data) {
        return result.data;
    }

    return {
        success: false,
        count: 0,
        error: result.error || 'Unknown error',
    };
}

export async function syncProducts(products: Product[]): Promise<SyncResult> {
    const result = await apiRequest<SyncResult>('/api/sync/products', {
        method: 'POST',
        body: JSON.stringify({ products }),
    });

    if (result.success && result.data) {
        return result.data;
    }

    return {
        success: false,
        count: 0,
        error: result.error || 'Unknown error',
    };
}

export async function syncMenus(menus: Menu[]): Promise<SyncResult> {
    const result = await apiRequest<SyncResult>('/api/sync/menus', {
        method: 'POST',
        body: JSON.stringify({ menus }),
    });

    if (result.success && result.data) {
        return result.data;
    }

    return {
        success: false,
        count: 0,
        error: result.error || 'Unknown error',
    };
}

export async function syncStockMovements(movements: StockMovement[]): Promise<SyncResult> {
    const result = await apiRequest<SyncResult>('/api/sync/stock-movements', {
        method: 'POST',
        body: JSON.stringify({ movements }),
    });

    if (result.success && result.data) {
        return result.data;
    }

    return {
        success: false,
        count: 0,
        error: result.error || 'Unknown error',
    };
}

export async function getSyncDiff(lastSync: string): Promise<{
    ts: string;
    products: Product[];
    menus: Menu[];
}> {
    const response = await fetch(`${getApiUrl()}/api/sync/diff?ts=${lastSync}`);
    if (!response.ok) {
        throw new Error('Failed to get sync diff');
    }
    return response.json();
}

// ===================================
// Read Endpoints (for dashboard)
// ===================================

export interface DashboardStats {
    today: {
        transaction_count: number;
        total_sales: number;
        cash_sales: number;
        card_sales: number;
    };
    week: {
        transaction_count: number;
        total_sales: number;
    };
    month: {
        transaction_count: number;
        total_sales: number;
    };
    lastUpdated: string;
}

export async function getStats(): Promise<ApiResponse<DashboardStats>> {
    return apiRequest<DashboardStats>('/api/stats');
}

// Upload Image
export async function uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    // We use native fetch here because apiRequest sets Content-Type to JSON
    const url = `${getApiUrl()}/api/upload`;
    const response = await fetch(url, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) throw new Error('Failed to upload image');
    const data = await response.json();
    return data.path; // Returns the full URL
}

// ===================================
// Closure API
// ===================================

export interface CurrentSessionData {
    transactionCount: number;
    totalCash: number;
    totalCard: number;
    totalMixed: number;
    total: number;
    transactions: any[];
}

export interface ClosureData {
    userId: number;
    expectedAmount: number;
    actualAmount: number;
    notes?: string;
}

export const getCurrentSession = async (): Promise<CurrentSessionData> => {
    const response = await fetch(`${getApiUrl()}/api/closure/current-session`);
    if (!response.ok) {
        throw new Error('Failed to fetch current session');
    }
    return response.json();
};

export const saveClosure = async (data: ClosureData): Promise<SyncResult> => {
    const response = await fetch(`${getApiUrl()}/api/closures`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.text();
        return { success: false, count: 0, error };
    }

    const result = await response.json();
    return { success: result.success, count: 1, message: 'Closure saved' };
};

// ===================================
// Transactions & Stock Movements API
// ===================================

export interface TransactionData {
    id: number;
    localId: number;
    userId: number;
    totalAmount: number;
    paymentMethod: PaymentMethod;
    cashReceived?: number;
    changeGiven?: number;
    createdAt: Date;
    isSynced: boolean;
}

export interface StockMovementData {
    id: number;
    localId: number;
    productId: number;
    productName: string;
    userId: number;
    type: string;
    quantity: number;
    reason?: string;
    createdAt: Date;
}

export const fetchTransactions = async (params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
}): Promise<{ transactions: TransactionData[]; count: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const url = `${getApiUrl()}/api/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to fetch transactions');
    }

    return response.json();
};

export const getStockMovements = async (params?: {
    productId?: number;
    type?: string;
    limit?: number;
}): Promise<{ movements: StockMovementData[]; count: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.productId) queryParams.append('productId', params.productId.toString());
    if (params?.type) queryParams.append('type', params.type);
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const url = `${getApiUrl()}/api/stock-movements${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to fetch stock movements');
    }

    return response.json();
};

export const createStockMovement = async (data: {
    productId: number;
    userId?: number;
    type: 'in' | 'out' | 'entry' | 'exit';
    quantity: number;
    reason?: string;
}): Promise<{ success: boolean; movement: any; newStock: number }> => {
    const response = await fetch(`${getApiUrl()}/api/stock-movements`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create stock movement');
    }

    return response.json();
};
