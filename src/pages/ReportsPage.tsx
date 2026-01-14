// ===================================
// Reports Page - Reporting Dashboard
// ===================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { useTransactionStore, useProductStore } from '../stores';
import { fetchTransactions, type TransactionData } from '../services/api';
import { generateDailyReport, generateStockReport, exportTransactionsToCSV, downloadCSV } from '../utils';
import './ReportsPage.css';

type TimeFilter = 'today' | 'week' | 'month';

export const ReportsPage: React.FC = () => {
    const navigate = useNavigate();
    const { transactions: localTransactions } = useTransactionStore();
    const { products } = useProductStore();

    const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
    const [backendTransactions, setBackendTransactions] = useState<TransactionData[]>([]);
    const [_isLoading, setIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);

    // Fetch transactions from backend
    useEffect(() => {
        const loadTransactions = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const data = await fetchTransactions({ limit: 1000 });
                setBackendTransactions(data.transactions);
            } catch (err) {
                console.error('Failed to fetch transactions:', err);
                setError('Impossible de charger les transactions');
            } finally {
                setIsLoading(false);
            }
        };

        loadTransactions();
    }, []);

    // Use backend transactions if available, fallback to local
    const transactions = (backendTransactions?.length ?? 0) > 0 ? backendTransactions : localTransactions;

    const handleBack = useCallback(() => {
        navigate('/pos');
    }, [navigate]);

    const handleGoToClosure = useCallback(() => {
        navigate('/closure');
    }, [navigate]);

    const handlePrintDailyReport = useCallback(() => {
        generateDailyReport(transactions);
    }, [transactions]);

    const handlePrintStockReport = useCallback(() => {
        generateStockReport(products);
    }, [products]);

    const handleExportTransactions = useCallback(() => {
        const csv = exportTransactionsToCSV(transactions);
        const date = new Date().toISOString().split('T')[0];
        downloadCSV(csv, `transactions_${date}.csv`);
    }, [transactions]);

    // Filtered transactions based on time
    const filteredTransactions = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        return transactions.filter((t) => {
            const date = new Date(t.createdAt);
            switch (timeFilter) {
                case 'today':
                    return date >= startOfDay;
                case 'week':
                    return date >= startOfWeek;
                case 'month':
                    return date >= startOfMonth;
                default:
                    return true;
            }
        });
    }, [transactions, timeFilter]);

    // Statistics
    const stats = useMemo(() => {
        const totalSales = filteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const totalCash = filteredTransactions
            .filter(t => t.paymentMethod === 'cash')
            .reduce((sum, t) => sum + t.totalAmount, 0);
        const totalCard = filteredTransactions
            .filter(t => t.paymentMethod === 'card')
            .reduce((sum, t) => sum + t.totalAmount, 0);
        const avgTransaction = filteredTransactions.length > 0
            ? totalSales / filteredTransactions.length
            : 0;

        return {
            totalSales,
            totalTransactions: filteredTransactions.length,
            totalCash,
            totalCard,
            avgTransaction,
        };
    }, [filteredTransactions]);

    // Daily chart data (last 7 days)
    const chartData = useMemo(() => {
        const days = [];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(date.getDate() + 1);

            const dayTransactions = transactions.filter((t) => {
                const tDate = new Date(t.createdAt);
                return tDate >= date && tDate < nextDate;
            });

            const total = dayTransactions.reduce((sum, t) => sum + t.totalAmount, 0);

            days.push({
                label: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
                value: total,
            });
        }

        return days;
    }, [transactions]);

    const maxChartValue = useMemo(() =>
        Math.max(...chartData.map(d => d.value), 1),
        [chartData]
    );

    // Recent transactions
    const recentTransactions = useMemo(() => {
        return [...filteredTransactions]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10);
    }, [filteredTransactions]);

    // Top products (simulated - would need transaction items in real app)
    const topProducts = useMemo(() => {
        // For now, just show first 5 products as placeholder
        return products.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name,
            sales: Math.floor(Math.random() * 50) + 10,
            revenue: p.price * (Math.floor(Math.random() * 50) + 10),
        })).sort((a, b) => b.revenue - a.revenue);
    }, [products]);

    const formatPrice = (price: number): string => {
        return price.toFixed(2).replace('.', ',') + ' €';
    };

    const formatTime = (date: Date): string => {
        return new Date(date).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getPaymentIcon = (method: string): string => {
        switch (method) {
            case 'cash': return '💵';
            case 'card': return '💳';
            case 'mixed': return '🔄';
            default: return '💰';
        }
    };

    return (
        <div className="reports-page">
            {/* Header */}
            <header className="reports-header">
                <div className="reports-header__left">
                    <button className="reports-header__back" onClick={handleBack} type="button">
                        ←
                    </button>
                    <h1 className="reports-header__title">Rapports & Statistiques</h1>
                </div>
                <div className="reports-header__actions">
                    <Button variant="ghost" size="sm" onClick={handleExportTransactions}>
                        📥 Export CSV
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePrintDailyReport}>
                        📊 Rapport jour
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePrintStockReport}>
                        📦 Rapport stock
                    </Button>
                    <Button variant="secondary" onClick={handleGoToClosure}>
                        📋 Clôture de caisse
                    </Button>
                </div>
            </header>

            <main className="reports-main">
                {/* Stats Cards */}
                <div className="reports-stats">
                    <div className="stat-card">
                        <div className="stat-card__header">
                            <div className="stat-card__icon stat-card__icon--sales">💰</div>
                        </div>
                        <div className="stat-card__value">{formatPrice(stats.totalSales)}</div>
                        <div className="stat-card__label">Chiffre d'affaires</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__header">
                            <div className="stat-card__icon stat-card__icon--transactions">🧾</div>
                        </div>
                        <div className="stat-card__value">{stats.totalTransactions}</div>
                        <div className="stat-card__label">Transactions</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__header">
                            <div className="stat-card__icon stat-card__icon--cash">💵</div>
                        </div>
                        <div className="stat-card__value">{formatPrice(stats.totalCash)}</div>
                        <div className="stat-card__label">Espèces</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__header">
                            <div className="stat-card__icon stat-card__icon--card">💳</div>
                        </div>
                        <div className="stat-card__value">{formatPrice(stats.totalCard)}</div>
                        <div className="stat-card__label">Carte</div>
                    </div>
                </div>

                <div className="reports-grid">
                    {/* Sales Chart */}
                    <div className="report-section">
                        <div className="report-section__header">
                            <h2 className="report-section__title">📊 Ventes des 7 derniers jours</h2>
                        </div>
                        <div className="report-section__body">
                            <div className="chart-container">
                                {chartData.map((day, index) => (
                                    <div key={index} className="chart-bar">
                                        <span className="chart-bar__value">
                                            {day.value > 0 ? formatPrice(day.value) : '-'}
                                        </span>
                                        <div
                                            className="chart-bar__bar"
                                            style={{
                                                height: `${(day.value / maxChartValue) * 180}px`,
                                            }}
                                        />
                                        <span className="chart-bar__label">{day.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Top Products */}
                    <div className="report-section">
                        <div className="report-section__header">
                            <h2 className="report-section__title">🏆 Top Produits</h2>
                        </div>
                        <div className="report-section__body">
                            {topProducts.length > 0 ? (
                                <div className="top-products">
                                    {topProducts.map((product, index) => (
                                        <div key={product.id} className="top-product">
                                            <span className={`top-product__rank top-product__rank--${index + 1}`}>
                                                {index + 1}
                                            </span>
                                            <div className="top-product__info">
                                                <span className="top-product__name">{product.name}</span>
                                                <span className="top-product__sales">{product.sales} vendus</span>
                                            </div>
                                            <span className="top-product__revenue">{formatPrice(product.revenue)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="reports-empty">
                                    <span className="reports-empty__icon">📦</span>
                                    <p className="reports-empty__text">Aucune donnée disponible</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="report-section">
                        <div className="report-section__header">
                            <h2 className="report-section__title">🕐 Dernières transactions</h2>
                            <div className="report-section__actions">
                                <button
                                    className={`report-section__filter ${timeFilter === 'today' ? 'report-section__filter--active' : ''}`}
                                    onClick={() => setTimeFilter('today')}
                                    type="button"
                                >
                                    Aujourd'hui
                                </button>
                                <button
                                    className={`report-section__filter ${timeFilter === 'week' ? 'report-section__filter--active' : ''}`}
                                    onClick={() => setTimeFilter('week')}
                                    type="button"
                                >
                                    Semaine
                                </button>
                                <button
                                    className={`report-section__filter ${timeFilter === 'month' ? 'report-section__filter--active' : ''}`}
                                    onClick={() => setTimeFilter('month')}
                                    type="button"
                                >
                                    Mois
                                </button>
                            </div>
                        </div>
                        <div className="report-section__body">
                            {recentTransactions.length > 0 ? (
                                <div className="transaction-list">
                                    {recentTransactions.map((transaction) => (
                                        <div key={transaction.id} className="transaction-item">
                                            <div className={`transaction-item__icon transaction-item__icon--${transaction.paymentMethod}`}>
                                                {getPaymentIcon(transaction.paymentMethod)}
                                            </div>
                                            <div className="transaction-item__info">
                                                <span className="transaction-item__id">Transaction #{transaction.id}</span>
                                                <span className="transaction-item__time">{formatTime(transaction.createdAt)}</span>
                                            </div>
                                            <span className="transaction-item__amount">{formatPrice(transaction.totalAmount)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="reports-empty">
                                    <span className="reports-empty__icon">🧾</span>
                                    <p className="reports-empty__text">Aucune transaction pour cette période</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ReportsPage;
