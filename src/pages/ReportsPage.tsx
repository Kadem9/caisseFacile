
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Button,
    ArrowLeftIcon,
    ChartIcon,
    PackageIcon,
    EuroIcon,
    ReceiptIcon,
    CashIcon,
    CardIcon,
    TrophyIcon,
    HistoryIcon,
    SyncIcon,
    ShoppingCartIcon,
    DownloadIcon
} from '../components/ui';
import { useTransactionStore, useProductStore, useClosureStore, useAuthStore } from '../stores';
import { fetchTransactions, type TransactionData } from '../services/api';
import { generateDailyReport, generateStockReport, exportTransactionsToCSV, downloadCSV } from '../utils';
import { generateClosurePDF } from '../services/pdfService';
import type { CashClosureWithDetails } from '../types';
import './ReportsPage.css';

type TimeFilter = 'today' | 'week' | 'month';
type Tab = 'stats' | 'history';

export const ReportsPage: React.FC = () => {
    const navigate = useNavigate();
    const { transactions: localTransactions } = useTransactionStore();
    const { products, categories } = useProductStore();
    const { closures, movements: localMovements } = useClosureStore();
    const { currentUser } = useAuthStore();

    const [activeTab, setActiveTab] = useState<Tab>('stats');
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
    const transactions = useMemo(() => {
        if ((backendTransactions?.length ?? 0) > 0) {
            return backendTransactions.map(t => ({
                ...t,
                items: [] as any[] // Add empty items to satisfy Transaction interface needs
            })) as any[];
        }
        return localTransactions;
    }, [backendTransactions, localTransactions]);

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

    const getPaymentIcon = (method: string): React.ReactNode => {
        switch (method) {
            case 'cash': return <CashIcon size={18} />;
            case 'card': return <CardIcon size={18} />;
            case 'mixed': return <SyncIcon size={18} />;
            default: return <EuroIcon size={18} />;
        }
    };

    return (
        <div className="reports-page">
            {/* Header */}
            <header className="reports-header">
                <div className="reports-header__left">
                    <button className="reports-header__back" onClick={handleBack} type="button">
                        <ArrowLeftIcon size={24} />
                    </button>
                    <h1 className="reports-header__title">Rapports & Statistiques</h1>
                </div>
                <div className="reports-header__actions">
                    <Button variant="ghost" size="sm" onClick={handleExportTransactions}>
                        <ShoppingCartIcon size={16} /> Export CSV
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePrintDailyReport}>
                        <ChartIcon size={16} /> Rapport jour
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePrintStockReport}>
                        <PackageIcon size={16} /> Rapport stock
                    </Button>
                    <Button variant="secondary" onClick={handleGoToClosure}>
                        <ReceiptIcon size={16} /> Clôture de caisse
                    </Button>
                </div>
            </header>

            <div className="reports-tabs">
                <button
                    className={`reports-tab ${activeTab === 'stats' ? 'reports-tab--active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    <ChartIcon size={18} /> Statistiques
                </button>
                <button
                    className={`reports-tab ${activeTab === 'history' ? 'reports-tab--active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <HistoryIcon size={18} /> Historique Clôtures
                </button>
            </div>

            <main className="reports-main">
                {activeTab === 'history' ? (
                    <div className="reports-section closure-history-section">
                        <div className="report-section__header">
                            <h2 className="report-section__title">
                                <HistoryIcon size={20} className="inline mr-2" />
                                Historique des Clôtures
                            </h2>
                        </div>
                        <div className="report-section__body">
                            {closures.length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="p-3 font-medium text-gray-500">Date</th>
                                            <th className="p-3 font-medium text-gray-500">Vendeur</th>
                                            <th className="p-3 font-medium text-text-right">Montant</th>
                                            <th className="p-3 font-medium text-text-right">Ecart</th>
                                            <th className="p-3 font-medium text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...closures].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()).map(closure => {
                                            const openDate = new Date(closure.openedAt);
                                            const closeDate = closure.closedAt ? new Date(closure.closedAt) : null;

                                            // Format Date Range
                                            let dateDisplay = openDate.toLocaleDateString('fr-FR');
                                            if (closeDate && openDate.toDateString() !== closeDate.toDateString()) {
                                                dateDisplay += ` - ${closeDate.toLocaleDateString('fr-FR')}`;
                                            }
                                            // Append time for precision
                                            dateDisplay += ` (${openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;

                                            const handleDownload = async () => {
                                                // Reconstruct Closure Details
                                                const closureStart = new Date(closure.openedAt).getTime();
                                                const closureEnd = closure.closedAt ? new Date(closure.closedAt).getTime() : Date.now();

                                                // Filter transactions within the session
                                                const sessionTransactions = localTransactions.filter(t => {
                                                    const tTime = new Date(t.createdAt).getTime();
                                                    return tTime >= closureStart && tTime <= closureEnd;
                                                });

                                                // Filter movements
                                                const sessionMovements = localMovements.filter(m => m.closureId === closure.id);

                                                const details: CashClosureWithDetails = {
                                                    ...closure,
                                                    user: currentUser!,
                                                    // Fallback mock user if missing
                                                    // user: { id: closure.userId, name: `Vendeur #${closure.userId}`, role: 'cashier', pinHash:'', isActive:true, createdAt:new Date(), updatedAt:new Date() },
                                                    transactions: sessionTransactions,
                                                    movements: sessionMovements
                                                };

                                                try {
                                                    await generateClosurePDF(details, products, categories);
                                                    console.log('Report downloaded');
                                                } catch (e) {
                                                    console.error(e);
                                                }
                                            };

                                            return (
                                                <tr key={closure.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="p-3">{dateDisplay}</td>
                                                    <td className="p-3">User #{closure.userId}</td>
                                                    <td className="p-3 font-medium">{closure.actualAmount?.toFixed(2)} €</td>
                                                    <td className={`p-3 font-medium ${(closure.difference || 0) < 0 ? 'text-red-500' :
                                                        (closure.difference || 0) > 0 ? 'text-green-500' : 'text-gray-500'
                                                        }`}>
                                                        {closure.difference && closure.difference > 0 ? '+' : ''}{closure.difference?.toFixed(2)} €
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <Button variant="ghost" size="sm" onClick={handleDownload}>
                                                            <DownloadIcon size={16} /> PDF
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-gray-500">
                                    Aucune clôture enregistrée.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="reports-stats">
                            <div className="stat-card">
                                <div className="stat-card__header">
                                    <div className="stat-card__icon stat-card__icon--sales">
                                        <EuroIcon size={24} />
                                    </div>
                                </div>
                                <div className="stat-card__value">{formatPrice(stats.totalSales)}</div>
                                <div className="stat-card__label">Chiffre d'affaires</div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-card__header">
                                    <div className="stat-card__icon stat-card__icon--transactions">
                                        <ReceiptIcon size={24} />
                                    </div>
                                </div>
                                <div className="stat-card__value">{stats.totalTransactions}</div>
                                <div className="stat-card__label">Transactions</div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-card__header">
                                    <div className="stat-card__icon stat-card__icon--cash">
                                        <CashIcon size={24} />
                                    </div>
                                </div>
                                <div className="stat-card__value">{formatPrice(stats.totalCash)}</div>
                                <div className="stat-card__label">Espèces</div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-card__header">
                                    <div className="stat-card__icon stat-card__icon--card">
                                        <CardIcon size={24} />
                                    </div>
                                </div>
                                <div className="stat-card__value">{formatPrice(stats.totalCard)}</div>
                                <div className="stat-card__label">Carte</div>
                            </div>
                        </div>

                        <div className="reports-grid">
                            {/* Sales Chart */}
                            <div className="report-section">
                                <div className="report-section__header">
                                    <h2 className="report-section__title">
                                        <ChartIcon size={20} className="inline mr-2" />
                                        Ventes des 7 derniers jours
                                    </h2>
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
                                    <h2 className="report-section__title">
                                        <TrophyIcon size={20} className="inline mr-2" />
                                        Top Produits
                                    </h2>
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
                                            <span className="reports-empty__icon">
                                                <PackageIcon size={48} color="#ccc" />
                                            </span>
                                            <p className="reports-empty__text">Aucune donnée disponible</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Transactions */}
                            <div className="report-section">
                                <div className="report-section__header">
                                    <h2 className="report-section__title">
                                        <HistoryIcon size={20} className="inline mr-2" />
                                        Dernières transactions
                                    </h2>
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
                                            <span className="reports-empty__icon">
                                                <ReceiptIcon size={48} color="#ccc" />
                                            </span>
                                            <p className="reports-empty__text">Aucune transaction pour cette période</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default ReportsPage;
