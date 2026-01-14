// ===================================
// Export Utilities - Data Export Functions
// ===================================

import type { Product, Category, Transaction, StockMovement, CashClosure } from '../types';

// ===================================
// CSV Generation
// ===================================

/**
 * Converts an array of objects to CSV format
 */
function objectsToCSV<T extends object>(data: T[], columns: { key: keyof T; label: string }[]): string {
    if (data.length === 0) return '';

    // Header row
    const header = columns.map(col => `"${col.label}"`).join(';');

    // Data rows
    const rows = data.map(item =>
        columns.map(col => {
            const value = item[col.key];
            if (value === null || value === undefined) return '';
            if (value instanceof Date) return `"${formatDateCSV(value)}"`;
            if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
            return String(value);
        }).join(';')
    );

    return [header, ...rows].join('\n');
}

function formatDateCSV(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR');
}

// ===================================
// Product Export
// ===================================

export function exportProductsToCSV(products: Product[], categories: Category[]): string {
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const data = products.map(p => ({
        ...p,
        categoryName: categoryMap.get(p.categoryId) || 'Inconnue',
    }));

    return objectsToCSV(data, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nom' },
        { key: 'categoryName', label: 'Catégorie' },
        { key: 'price', label: 'Prix (€)' },
        { key: 'stockQuantity', label: 'Stock' },
        { key: 'alertThreshold', label: 'Seuil Alerte' },
        { key: 'isActive', label: 'Actif' },
    ]);
}

export function exportCategoriesToCSV(categories: Category[]): string {
    const data = categories.map(c => ({ ...c }));
    return objectsToCSV(data, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nom' },
        { key: 'color', label: 'Couleur' },
        { key: 'icon', label: 'Icône' },
        { key: 'sortOrder', label: 'Ordre' },
        { key: 'isActive', label: 'Actif' },
    ]);
}

// ===================================
// Transactions Export
// ===================================

export function exportTransactionsToCSV(transactions: Transaction[]): string {
    const data = transactions.map(t => ({ ...t }));
    return objectsToCSV(data, [
        { key: 'id', label: 'ID' },
        { key: 'createdAt', label: 'Date' },
        { key: 'totalAmount', label: 'Montant (€)' },
        { key: 'paymentMethod', label: 'Moyen de paiement' },
        { key: 'cashReceived', label: 'Espèces reçues' },
        { key: 'changeGiven', label: 'Monnaie rendue' },
    ]);
}

// ===================================
// Stock Movements Export
// ===================================

export function exportStockMovementsToCSV(movements: StockMovement[], products: Product[]): string {
    const productMap = new Map(products.map(p => [p.id, p.name]));

    const data = movements.map(m => ({
        ...m,
        productName: productMap.get(m.productId) || 'Inconnu',
    }));

    return objectsToCSV(data, [
        { key: 'id', label: 'ID' },
        { key: 'createdAt', label: 'Date' },
        { key: 'productName', label: 'Produit' },
        { key: 'type', label: 'Type' },
        { key: 'quantity', label: 'Quantité' },
        { key: 'reason', label: 'Raison' },
    ]);
}

// ===================================
// Cash Closures Export
// ===================================

export function exportClosuresToCSV(closures: CashClosure[]): string {
    const data = closures.map(c => ({ ...c }));
    return objectsToCSV(data, [
        { key: 'id', label: 'ID' },
        { key: 'openedAt', label: 'Ouverture' },
        { key: 'closedAt', label: 'Fermeture' },
        { key: 'expectedAmount', label: 'Montant attendu (€)' },
        { key: 'actualAmount', label: 'Montant réel (€)' },
        { key: 'difference', label: 'Écart (€)' },
        { key: 'notes', label: 'Notes' },
    ]);
}

// ===================================
// File Download Utility
// ===================================

export function downloadCSV(content: string, filename: string): void {
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

// ===================================
// JSON Export/Import
// ===================================

export interface ExportData {
    version: string;
    exportedAt: string;
    products: Product[];
    categories: Category[];
    transactions: Transaction[];
    stockMovements: StockMovement[];
    closures: CashClosure[];
}

export function exportAllToJSON(data: Omit<ExportData, 'version' | 'exportedAt'>): string {
    const exportData: ExportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        ...data,
    };

    return JSON.stringify(exportData, null, 2);
}

export function downloadJSON(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

// ===================================
// Import Functions
// ===================================

export function parseProductsFromCSV(csvContent: string): Partial<Product>[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase());

    return lines.slice(1).map(line => {
        const values = line.split(';').map(v => v.replace(/"/g, '').trim());
        const product: Partial<Product> = {};

        headers.forEach((header, index) => {
            const value = values[index];
            switch (header) {
                case 'nom':
                case 'name':
                    product.name = value;
                    break;
                case 'prix':
                case 'prix (€)':
                case 'price':
                    product.price = parseFloat(value.replace(',', '.')) || 0;
                    break;
                case 'stock':
                case 'stockquantity':
                    product.stockQuantity = parseInt(value) || 0;
                    break;
                case 'seuil alerte':
                case 'alertthreshold':
                    product.alertThreshold = parseInt(value) || 10;
                    break;
            }
        });

        return product;
    }).filter(p => p.name);
}

export function parseJSONImport(jsonContent: string): ExportData | null {
    try {
        const data = JSON.parse(jsonContent);
        if (data.version && data.products) {
            return data as ExportData;
        }
        return null;
    } catch {
        return null;
    }
}
