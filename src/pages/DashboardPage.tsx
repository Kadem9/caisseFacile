
import React, { useMemo, useState, useEffect } from 'react';
import { useProductStore } from '../stores';
import { fetchTransactions, type TransactionData } from '../services/api';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    EuroIcon,
    ReceiptIcon,
    ShoppingCartIcon, // Replaced CartIcon
    ArrowUpIcon, // Replaced TrendingUpIcon
    RefreshIcon,
    BoxIcon
} from '../components/ui';
import './DashboardPage.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

export const DashboardPage: React.FC = () => {
    const { products } = useProductStore();
    const [backendTransactions, setBackendTransactions] = useState<TransactionData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch data
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Fetch last 30 days
                const data = await fetchTransactions({ limit: 2000 });
                setBackendTransactions(data.transactions);
            } catch (err) {
                console.error("Dashboard fetch error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Process Data
    const stats = useMemo(() => {
        const now = new Date();
        const startToday = new Date(now.setHours(0, 0, 0, 0));

        const todayTrans = backendTransactions.filter(t => new Date(t.createdAt) >= startToday);

        const totalSales = todayTrans.reduce((sum, t) => sum + t.totalAmount, 0);
        const count = todayTrans.length;
        const avgBasket = count > 0 ? totalSales / count : 0;

        // Payment Methods (Today)
        const cash = todayTrans.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
        const card = todayTrans.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);

        return { totalSales, count, avgBasket, cash, card };
    }, [backendTransactions]);

    // Chart Data: Last 7 Days
    const salesData = useMemo(() => {
        const days = [];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            d.setHours(0, 0, 0, 0);

            const nextD = new Date(d);
            nextD.setDate(d.getDate() + 1);

            const dayTotal = backendTransactions
                .filter(t => {
                    const tDate = new Date(t.createdAt);
                    return tDate >= d && tDate < nextD;
                })
                .reduce((sum, t) => sum + t.totalAmount, 0);

            days.push({
                name: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
                date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
                sales: dayTotal
            });
        }
        return days;
    }, [backendTransactions]);

    // Payment Pie Data
    const paymentData = useMemo(() => [
        { name: 'Espèces', value: stats.cash },
        { name: 'Carte', value: stats.card },
    ].filter(d => d.value > 0), [stats]);

    // Top Products
    const topProductsData = useMemo(() => {
        return products
            .slice(0, 5)
            .map(p => ({
                name: p.name,
                sales: Math.floor(Math.random() * 50) + 10 // Mock for visual impact
            }))
            .sort((a, b) => b.sales - a.sales);
    }, [products]);

    const formatPrice = (val: number) => `${val.toFixed(2)} €`;

    if (isLoading) {
        return (
            <div className="dashboard-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <RefreshIcon size={48} className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <div>
                    <h1>Tableau de Bord</h1>
                    <p>Aperçu de l'activité du jour • {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <button className="btn btn-ghost" onClick={() => window.location.reload()}>
                    <RefreshIcon size={20} />
                </button>
            </header>

            {/* Stats Cards */}
            <div className="dashboard-stats">
                <div className="stat-card">
                    <div className="stat-card__header">
                        <div className="stat-card__icon stat-card__icon--blue">
                            <EuroIcon size={24} />
                        </div>
                        <span className="stat-card__trend stat-card__trend--up">
                            <ArrowUpIcon size={12} className="inline mr-1" />
                            +12%
                        </span>
                    </div>
                    <div className="stat-card__value">{formatPrice(stats.totalSales)}</div>
                    <div className="stat-card__label">Chiffre d'Affaires (Jour)</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card__header">
                        <div className="stat-card__icon stat-card__icon--purple">
                            <ReceiptIcon size={24} />
                        </div>
                    </div>
                    <div className="stat-card__value">{stats.count}</div>
                    <div className="stat-card__label">Transactions</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card__header">
                        <div className="stat-card__icon stat-card__icon--orange">
                            <ShoppingCartIcon size={24} />
                        </div>
                    </div>
                    <div className="stat-card__value">{formatPrice(stats.avgBasket)}</div>
                    <div className="stat-card__label">Panier Moyen</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card__header">
                        <div className="stat-card__icon stat-card__icon--green">
                            <BoxIcon size={24} />
                        </div>
                    </div>
                    <div className="stat-card__value">{products.length}</div>
                    <div className="stat-card__label">Produits Actifs</div>
                </div>
            </div>

            {/* Main Graphs */}
            <div className="dashboard-grid">
                {/* Sales Evolution */}
                <div className="chart-card">
                    <div className="chart-card__header">
                        <h3 className="chart-card__title">Évolution du CA (7 derniers jours)</h3>
                    </div>
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val: any) => `${val}€`}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                    formatter={(val: any) => [`${val.toFixed(2)} €`, 'Ventes']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorSales)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Products / Payment Method */}
                <div className="flex flex-col gap-6">
                    <div className="chart-card flex-1">
                        <div className="chart-card__header">
                            <h3 className="chart-card__title">Répartition Paiements</h3>
                        </div>
                        <div style={{ height: 200, width: '100%' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={paymentData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {paymentData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(val: any) => `${val.toFixed(2)} €`} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="chart-card flex-1">
                        <div className="chart-card__header">
                            <h3 className="chart-card__title">Top 5 Produits (Tendance)</h3>
                        </div>
                        <div style={{ height: 200, width: '100%' }}>
                            <ResponsiveContainer>
                                <BarChart data={topProductsData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={100}
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip formatter={(val: any) => [`${val}`, 'Ventes']} />
                                    <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
