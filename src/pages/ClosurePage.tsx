// ===================================
// Closure Page - Cash Closure Interface
// ===================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Button,
    ChartIcon,
    CashIcon,
    PowerIcon,
    ArrowLeftIcon,
    EditIcon,
    VirtualKeyboard
} from '../components/ui';
import { CashCounter } from '../components/pos/CashCounter';
import { useAuthStore, useTransactionStore, useClosureStore, useProductStore } from '../stores';
import { getCurrentSession, type CurrentSessionData } from '../services/api';
import { generateClosurePDF } from '../services/pdfService';
import type { CashClosureWithDetails } from '../types';
import './ClosurePage.css';

// Local utility
const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const ClosurePage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuthStore();
    const { getTodayTransactions } = useTransactionStore();
    const { products, categories } = useProductStore();
    const {
        currentClosure,
        closeClosure,
        isClosureOpen,
        getCurrentSessionMovements
    } = useClosureStore();

    // State
    const [actualAmount, setActualAmount] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [backendSession, setBackendSession] = useState<CurrentSessionData | null>(null);
    const [_isLoading, setIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);

    // Fetch session data from backend
    useEffect(() => {
        const fetchSession = async () => {
            try {
                setIsLoading(true);
                const session = await getCurrentSession();
                setBackendSession(session);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch session:', err);
                setError("Impossible de charger les données de session");
            } finally {
                setIsLoading(false);
            }
        };

        fetchSession();
    }, []);

    // Calculate session stats using STRICT filtering by session start time
    const todayTransactions = getTodayTransactions();
    const localMovements = getCurrentSessionMovements();

    // Filter transactions to only those AFTER the current session opened
    const currentSessionTransactions = useMemo(() => {
        if (!currentClosure) return [];
        const openTime = new Date(currentClosure.openedAt).getTime();
        return todayTransactions.filter(t => new Date(t.createdAt).getTime() >= openTime);
    }, [todayTransactions, currentClosure]);

    const sessionStats = useMemo(() => {
        // Fallback or use backend if available (backend usually handles this correctly)
        if (backendSession && backendSession.isOpen) {
            return {
                isOpen: true,
                transactionCount: backendSession.transactionCount,
                totalCashSales: backendSession.totalCash,
                totalCardSales: backendSession.totalCard,
                totalSales: backendSession.totalSales,
                initialAmount: backendSession.initialAmount,
                totalWithdrawals: backendSession.totalWithdrawals,
                totalDeposits: backendSession.totalDeposits,
            };
        }

        // Local calculation using filtered transactions
        const totalCash = currentSessionTransactions.reduce((sum, t) => {
            if (t.paymentMethod === 'cash') return sum + t.totalAmount;
            if (t.paymentMethod === 'mixed') return sum + (Math.max(0, (t.cashReceived || 0) - (t.changeGiven || 0)));
            return sum;
        }, 0);

        const totalCard = currentSessionTransactions.reduce((sum, t) => {
            if (t.paymentMethod === 'card') return sum + t.totalAmount;
            if (t.paymentMethod === 'mixed') {
                const effectiveCash = Math.max(0, (t.cashReceived || 0) - (t.changeGiven || 0));
                return sum + (t.totalAmount - effectiveCash);
            }
            return sum;
        }, 0);

        const totalSales = currentSessionTransactions.reduce((sum, t) => sum + t.totalAmount, 0);

        const withdrawals = localMovements
            .filter(m => m.type === 'withdrawal')
            .reduce((sum, m) => sum + m.amount, 0);

        const deposits = localMovements
            .filter(m => m.type === 'deposit')
            .reduce((sum, m) => sum + m.amount, 0);

        return {
            isOpen: isClosureOpen(),
            transactionCount: currentSessionTransactions.length,
            totalCashSales: totalCash,
            totalCardSales: totalCard,
            totalSales: totalSales,
            initialAmount: currentClosure?.initialAmount || 0,
            totalWithdrawals: withdrawals,
            totalDeposits: deposits,
        };
    }, [backendSession, currentSessionTransactions, localMovements, currentClosure]);

    // Expected Cash in Drawer = Initial + Cash Sales - Withdrawals + Deposits
    const expectedCash = useMemo(() => {
        return (
            sessionStats.initialAmount +
            sessionStats.totalCashSales -
            sessionStats.totalWithdrawals +
            sessionStats.totalDeposits
        );
    }, [sessionStats]);

    const difference = useMemo(() => {
        return actualAmount - expectedCash;
    }, [actualAmount, expectedCash]);

    const handleBack = useCallback(() => {
        navigate('/pos');
    }, [navigate]);

    const handleOpenSession = useCallback(() => {
        navigate('/pos');
    }, [navigate]);

    const handleCloseSession = async () => {
        if (!currentClosure) return;

        if (window.confirm(`Confirmer la clôture avec un montant de ${formatPrice(actualAmount)} ?`)) {
            setIsLoading(true);
            try {
                // 1. Close locally with correct signature
                await closeClosure({ actualAmount, notes });

                // 2. Generate PDF
                const closureDetails: CashClosureWithDetails = {
                    ...currentClosure,
                    id: currentClosure.id,
                    openedAt: currentClosure.openedAt,
                    closedAt: new Date(),
                    initialAmount: currentClosure.initialAmount,
                    userId: currentClosure.userId,

                    actualAmount: actualAmount,
                    expectedAmount: expectedCash,
                    difference: difference,
                    notes: notes || undefined,
                    isSynced: false,
                    transactions: currentSessionTransactions,
                    movements: localMovements,

                    user: currentUser!
                };

                await generateClosurePDF(closureDetails, products, categories);

                alert("Session clôturée avec succès.");
                navigate('/admin/dashboard');

            } catch (err) {
                console.error(err);
                alert("Erreur lors de la clôture.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="closure-page">
            <header className="closure-header">
                <div className="closure-header__left">
                    <button className="closure-header__back" onClick={handleBack} type="button">
                        <ArrowLeftIcon size={24} />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="closure-header__title">Clôture de Caisse</h1>
                        {currentClosure && (
                            <span className="text-xs text-gray-500 font-medium">
                                Session ouverte depuis le {formatDate(currentClosure.openedAt)}
                            </span>
                        )}
                    </div>
                </div>
                <div className={`closure-header__status ${isClosureOpen() ? 'closure-header__status--open' : 'closure-header__status--closed'
                    }`}>
                    {isClosureOpen() ? (
                        <>
                            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                            Session Ouverte
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
                            Session Fermée
                        </>
                    )}
                </div>
            </header>

            <main className="closure-main">
                <div className="closure-content">

                    {/* LEFT COLUMN: Summary & Stats */}
                    <div className="closure-card">
                        <h2 className="closure-card__title">
                            <ChartIcon size={20} className="mr-2" />
                            Synthèse & Ecarts
                        </h2>

                        {/* Top Stats - Compact */}
                        <div className="closure-summary__grid">
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">CA Espèces</span>
                                <span className="closure-summary__value">{formatPrice(sessionStats.totalCashSales)}</span>
                            </div>
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">Total Théorique</span>
                                <span className="closure-summary__value closure-summary__value--highlight">
                                    {formatPrice(expectedCash)}
                                </span>
                            </div>
                        </div>

                        {/* Totals & Difference - Prominent */}
                        <div className="bg-gray-50 rounded-xl p-4 my-4 border border-gray-200">
                            <div className="flex justify-between items-end mb-4 border-b border-gray-200 pb-4">
                                <div>
                                    <p className="text-gray-500 text-sm font-bold uppercase">Total Compté</p>
                                    <p className="text-3xl font-black text-gray-900 leading-none mt-1">
                                        {formatPrice(actualAmount)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-500 text-sm font-bold uppercase">Théorique</p>
                                    <p className="text-xl font-bold text-gray-600">
                                        {formatPrice(expectedCash)}
                                    </p>
                                </div>
                            </div>

                            <div className={`flex justify-between items-center rounded-lg p-3 ${difference === 0 ? 'bg-gray-100 text-gray-600' :
                                difference > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                <span className="font-bold text-sm uppercase">Ecart (Manque/Excédent)</span>
                                <span className="text-2xl font-black tracking-tight">
                                    {difference > 0 ? '+' : ''}{formatPrice(difference)}
                                </span>
                            </div>
                        </div>

                        {/* Details - Collapsible/Compact */}
                        <div className="closure-details-scroll">
                            <h3 className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Détail des Calculs</h3>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Fond de Caisse (Initial)</span>
                                    <span>{formatPrice(sessionStats.initialAmount)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-green-600 font-medium">
                                    <span>+ Ventes Espèces</span>
                                    <span>{formatPrice(sessionStats.totalCashSales)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-blue-600 font-medium">
                                    <span>+ Dépôts</span>
                                    <span>{formatPrice(sessionStats.totalDeposits)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-red-500 font-medium">
                                    <span>- Retraits</span>
                                    <span>{formatPrice(sessionStats.totalWithdrawals)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="closure-notes-container mt-auto">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                Notes
                            </label>
                            <div className="relative">
                                <textarea
                                    className="closure-count__textarea"
                                    placeholder="Toucher pour ouvrir le clavier..."
                                    value={notes}
                                    readOnly // Force use of keyboard
                                    onClick={() => setIsKeyboardOpen(true)}
                                    disabled={!isClosureOpen()}
                                />
                                <button
                                    className="absolute right-2 bottom-2 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                                    onClick={() => setIsKeyboardOpen(true)}
                                    disabled={!isClosureOpen()}
                                >
                                    <EditIcon size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Action & Closure */}
                    <div className="closure-card closure-card--interactive flex flex-col h-full">
                        <h2 className="closure-card__title mb-2">
                            <CashIcon size={20} className="mr-2" />
                            Comptage
                        </h2>

                        {/* Expanded Counter Area */}
                        <div className="closure-counter-scroll flex-1 border-0 p-0 mb-2">
                            <CashCounter
                                onChange={setActualAmount}
                                showTotal={false}
                                initialValues={{}}
                                className="h-full"
                            />
                        </div>

                        <div className="closure-actions pt-2 border-t border-gray-100">
                            {!isClosureOpen() ? (
                                <Button
                                    variant="primary"
                                    onClick={handleOpenSession}
                                    className="w-full py-4 text-xl font-bold"
                                >
                                    <PowerIcon size={24} className="mr-2" /> Ouvrir la Caisse
                                </Button>
                            ) : (
                                <Button
                                    variant="danger"
                                    onClick={handleCloseSession}
                                    className="w-full py-4 text-xl font-bold shadow-lg"
                                >
                                    <PowerIcon size={24} className="mr-2" /> Clôturer
                                </Button>
                            )}
                        </div>
                    </div>

                </div>
            </main>

            <VirtualKeyboard
                isOpen={isKeyboardOpen}
                onClose={() => setIsKeyboardOpen(false)}
                onInput={setNotes}
                value={notes}
                title="Saisir la note de clôture"
            />
        </div>
    );
};

export default ClosurePage;
