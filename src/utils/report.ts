// ===================================
// PDF Report Generator - Simple Text-Based PDF
// ===================================

/**
 * Simple PDF Generator using HTML and print
 * For a full-featured PDF, we'd use jsPDF, but this keeps it lightweight
 */

import type { Transaction, CashClosure, Product } from '../types';

interface ReportData {
    title: string;
    subtitle?: string;
    date: Date;
    sections: ReportSection[];
}

interface ReportSection {
    title: string;
    type: 'stats' | 'table' | 'text';
    data: StatItem[] | TableData | string;
}

interface StatItem {
    label: string;
    value: string;
}

interface TableData {
    headers: string[];
    rows: string[][];
}

/**
 * Generates an HTML report and opens print dialog
 */
export function generateReport(data: ReportData): void {
    const html = buildReportHTML(data);
    openPrintWindow(html, data.title);
}

function buildReportHTML(data: ReportData): string {
    const formatDate = (d: Date) => new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${data.title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #1e293b;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e2e8f0;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 8px;
        }
        .header .subtitle {
            font-size: 16px;
            color: #64748b;
        }
        .header .date {
            font-size: 14px;
            color: #94a3b8;
            margin-top: 12px;
        }
        .section {
            margin-bottom: 32px;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }
        .stat-item {
            padding: 16px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .stat-label {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #0f172a;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        th {
            background: #f1f5f9;
            font-weight: 600;
            font-size: 13px;
            color: #475569;
            text-transform: uppercase;
        }
        td {
            font-size: 14px;
            color: #334155;
        }
        tr:nth-child(even) {
            background: #f8fafc;
        }
        .text-content {
            font-size: 14px;
            line-height: 1.6;
            color: #475569;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
        }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚽ Ma Caisse AG</h1>
        <div class="subtitle">${data.title}</div>
        ${data.subtitle ? `<div class="subtitle">${data.subtitle}</div>` : ''}
        <div class="date">Généré le ${formatDate(data.date)}</div>
    </div>

    ${data.sections.map(section => `
        <div class="section">
            <h2 class="section-title">${section.title}</h2>
            ${renderSection(section)}
        </div>
    `).join('')}

    <div class="footer">
        Ma Caisse AG - Rapport généré automatiquement
    </div>
</body>
</html>
    `;
}

function renderSection(section: ReportSection): string {
    switch (section.type) {
        case 'stats':
            return renderStats(section.data as StatItem[]);
        case 'table':
            return renderTable(section.data as TableData);
        case 'text':
            return `<div class="text-content">${section.data}</div>`;
        default:
            return '';
    }
}

function renderStats(stats: StatItem[]): string {
    return `
        <div class="stats-grid">
            ${stats.map(stat => `
                <div class="stat-item">
                    <div class="stat-label">${stat.label}</div>
                    <div class="stat-value">${stat.value}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTable(data: TableData): string {
    return `
        <table>
            <thead>
                <tr>
                    ${data.headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.rows.map(row => `
                    <tr>
                        ${row.map(cell => `<td>${cell}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function openPrintWindow(html: string, _title: string): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Veuillez autoriser les popups pour générer le rapport.');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
}

// ===================================
// Pre-built Report Templates
// ===================================

export function generateDailyReport(
    transactions: Transaction[],
    date: Date = new Date()
): void {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const dayTransactions = transactions.filter(t => {
        const tDate = new Date(t.createdAt);
        return tDate >= startOfDay && tDate <= endOfDay;
    });

    const totalSales = dayTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const cashSales = dayTransactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
    const cardSales = dayTransactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);
    const avgTicket = dayTransactions.length > 0 ? totalSales / dayTransactions.length : 0;

    const formatPrice = (p: number) => p.toFixed(2).replace('.', ',') + ' €';
    const formatTime = (d: Date) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const reportData: ReportData = {
        title: 'Rapport Journalier',
        subtitle: new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        date: new Date(),
        sections: [
            {
                title: '📊 Résumé',
                type: 'stats',
                data: [
                    { label: 'Chiffre d\'affaires', value: formatPrice(totalSales) },
                    { label: 'Nombre de transactions', value: String(dayTransactions.length) },
                    { label: 'Ticket moyen', value: formatPrice(avgTicket) },
                    { label: 'Paiements espèces', value: formatPrice(cashSales) },
                    { label: 'Paiements carte', value: formatPrice(cardSales) },
                    { label: 'Mixte/Autre', value: formatPrice(totalSales - cashSales - cardSales) },
                ],
            },
            {
                title: '🧾 Détail des Transactions',
                type: 'table',
                data: {
                    headers: ['#', 'Heure', 'Montant', 'Paiement'],
                    rows: dayTransactions.map(t => [
                        String(t.id),
                        formatTime(t.createdAt),
                        formatPrice(t.totalAmount),
                        t.paymentMethod === 'cash' ? 'Espèces' : t.paymentMethod === 'card' ? 'Carte' : 'Mixte',
                    ]),
                },
            },
        ],
    };

    generateReport(reportData);
}

export function generateClosureReport(closure: CashClosure, transactions: Transaction[]): void {
    const closureTransactions = transactions.filter(t => {
        const tDate = new Date(t.createdAt);
        const openDate = new Date(closure.openedAt);
        const closeDate = closure.closedAt ? new Date(closure.closedAt) : new Date();
        return tDate >= openDate && tDate <= closeDate;
    });

    const totalSales = closureTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const cashSales = closureTransactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
    const cardSales = closureTransactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);

    const formatPrice = (p: number) => p.toFixed(2).replace('.', ',') + ' €';
    const formatDateTime = (d: Date) => new Date(d).toLocaleString('fr-FR');

    const difference = closure.difference ?? 0;
    const differenceText = difference === 0 ? '✓ Équilibrée' : difference > 0 ? `+${formatPrice(difference)} (excédent)` : `${formatPrice(difference)} (déficit)`;

    const reportData: ReportData = {
        title: 'Rapport de Clôture',
        subtitle: `Clôture #${closure.id}`,
        date: new Date(),
        sections: [
            {
                title: '⏰ Période',
                type: 'stats',
                data: [
                    { label: 'Ouverture', value: formatDateTime(closure.openedAt) },
                    { label: 'Fermeture', value: closure.closedAt ? formatDateTime(closure.closedAt) : 'En cours' },
                ],
            },
            {
                title: '💰 Récapitulatif',
                type: 'stats',
                data: [
                    { label: 'Chiffre d\'affaires', value: formatPrice(totalSales) },
                    { label: 'Transactions', value: String(closureTransactions.length) },
                    { label: 'Espèces', value: formatPrice(cashSales) },
                    { label: 'Carte', value: formatPrice(cardSales) },
                ],
            },
            {
                title: '📋 Clôture de Caisse',
                type: 'stats',
                data: [
                    { label: 'Montant attendu', value: formatPrice(closure.expectedAmount) },
                    { label: 'Montant réel', value: formatPrice(closure.actualAmount ?? 0) },
                    { label: 'Écart', value: differenceText },
                ],
            },
            ...(closure.notes ? [{
                title: '📝 Notes',
                type: 'text' as const,
                data: closure.notes,
            }] : []),
        ],
    };

    generateReport(reportData);
}

export function generateStockReport(products: Product[]): void {
    const formatPrice = (p: number) => p.toFixed(2).replace('.', ',') + ' €';

    const activeProducts = products.filter(p => p.isActive);
    const lowStock = activeProducts.filter(p => p.stockQuantity <= p.alertThreshold);
    const outOfStock = activeProducts.filter(p => p.stockQuantity === 0);
    const totalValue = activeProducts.reduce((sum, p) => sum + (p.price * p.stockQuantity), 0);

    const reportData: ReportData = {
        title: 'Rapport de Stock',
        date: new Date(),
        sections: [
            {
                title: '📊 Vue d\'ensemble',
                type: 'stats',
                data: [
                    { label: 'Produits actifs', value: String(activeProducts.length) },
                    { label: 'Valeur totale stock', value: formatPrice(totalValue) },
                    { label: 'Alertes stock bas', value: String(lowStock.length) },
                    { label: 'Ruptures de stock', value: String(outOfStock.length) },
                ],
            },
            {
                title: '⚠️ Produits en alerte',
                type: 'table',
                data: {
                    headers: ['Produit', 'Stock actuel', 'Seuil alerte', 'Statut'],
                    rows: lowStock.map(p => [
                        p.name,
                        String(p.stockQuantity),
                        String(p.alertThreshold),
                        p.stockQuantity === 0 ? '🔴 Rupture' : '🟡 Bas',
                    ]),
                },
            },
            {
                title: '📦 Tous les produits',
                type: 'table',
                data: {
                    headers: ['Produit', 'Prix', 'Stock', 'Valeur'],
                    rows: activeProducts.map(p => [
                        p.name,
                        formatPrice(p.price),
                        String(p.stockQuantity),
                        formatPrice(p.price * p.stockQuantity),
                    ]),
                },
            },
        ],
    };

    generateReport(reportData);
}
