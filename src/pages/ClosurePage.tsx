// ===================================
// Closure Page - Cash Closure Interface
// ===================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { useAuthStore, useTransactionStore, useClosureStore, useSyncStore } from '../stores';
import { getCurrentSession, saveClosure, type CurrentSessionData } from '../services/api';
import type { CashClosure } from '../types';
import './ClosurePage.css';

export const ClosurePage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuthStore();
    const { getTodayTransactions, getTodayTotal, clearSessionTransactions } = useTransactionStore();
    const {
        currentClosure,
        openClosure,
        closeClosure,
        getClosureHistory,
        isClosureOpen,
    } = useClosureStore();

    // State
    const [actualAmount, setActualAmount] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [backendSession, setBackendSession] = useState<CurrentSessionData | null>(null);
    const [_isLoading, setIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);

    // Fetch session data from backend
    useEffect(() => {
        const fetchSession = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const data = await getCurrentSession();
                setBackendSession(data);
            } catch (err) {
                console.error('Failed to fetch session:', err);
                setError('Impossible de charger les données de session');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSession();
    }, []);

    // Calculate session stats (use backend data if available, fallback to local)
    const todayTransactions = getTodayTransactions();
    const todayTotal = getTodayTotal();

    const sessionStats = useMemo(() => {
        if (backendSession) {
            return {
                transactionCount: backendSession.transactionCount,
                totalCash: backendSession.totalCash,
                totalCard: backendSession.totalCard,
                total: backendSession.total,
            };
        }

        // Fallback to local data
        const cash = todayTransactions
            .filter(t => t.paymentMethod === 'cash')
            .reduce((sum, t) => sum + t.totalAmount, 0);
        const card = todayTransactions
            .filter(t => t.paymentMethod === 'card')
            .reduce((sum, t) => sum + t.totalAmount, 0);

        return {
            transactionCount: todayTransactions.length,
            totalCash: cash,
            totalCard: card,
            total: todayTotal,
        };
    }, [backendSession, todayTransactions, todayTotal]);

    const expectedCash = currentClosure?.expectedAmount ?? sessionStats.totalCash;
    const difference = actualAmount - expectedCash;
    const closureHistory = getClosureHistory(5);

    // Handlers
    const handleBack = useCallback(() => {
        navigate('/pos');
    }, [navigate]);

    const handleOpenClosure = useCallback(() => {
        if (!currentUser) return;

        openClosure({
            userId: currentUser.id,
            expectedAmount: 0, // Start with 0, will accumulate from sales
        });
    }, [currentUser, openClosure]);

    const handleCloseClosure = useCallback(async () => {
        if (!currentUser) return;

        // Prepare closure data
        const closureData = {
            userId: currentUser.id,
            expectedAmount: expectedCash,
            actualAmount,
            notes: notes || undefined,
            createdAt: new Date().toISOString(),
        };

        // Always update local state first for UI feedback
        if (currentClosure) {
            closeClosure({
                actualAmount,
                notes: notes || undefined,
            });
        }

        clearSessionTransactions();
        setActualAmount(0);
        setNotes('');

        // Now try to sync with backend
        try {
            const { checkConnection, addToQueue } = useSyncStore.getState();
            const isOnline = await checkConnection();

            if (isOnline) {
                // Try to save to backend
                await saveClosure(closureData);
                console.log('[Closure] Synced to backend successfully');
            } else {
                // Offline: Queue for later sync
                console.log('[Closure] Offline mode - queuing closure for later sync');
                addToQueue('closure', { ...closureData, id: Date.now() } as unknown as CashClosure);
            }
        } catch (err) {
            // Network error: Queue for later sync
            console.warn('[Closure] Network error, queuing closure:', err);
            const { addToQueue } = useSyncStore.getState();
            addToQueue('closure', { ...closureData, id: Date.now() } as unknown as CashClosure);
        }
    }, [currentUser, currentClosure, expectedCash, actualAmount, notes, closeClosure, clearSessionTransactions]);

    const handleQuickAmount = useCallback((amount: number) => {
        setActualAmount(prev => prev + amount);
    }, []);

    const formatPrice = (price: number): string => {
        return price.toFixed(2).replace('.', ',') + ' €';
    };

    const formatDate = (date: Date): string => {
        return new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getDifferenceClass = (diff: number): string => {
        if (diff > 0) return 'positive';
        if (diff < 0) return 'negative';
        return 'neutral';
    };

    const closureOpen = isClosureOpen();

    return (
        <div className="closure-page">
            {/* Header */}
            <header className="closure-header">
                <Button variant="secondary" onClick={handleBack}>
                    ← Retour au POS
                </Button>
                <h1>Clôture de Caisse</h1>
            </header>

            <div className={`closure-status ${closureOpen ? 'closure-status--open' : 'closure-status--closed'}`}>
                <div className="closure-status__icon">
                    {closureOpen ? '🟢' : '🟡'}
                </div>
                <h2 className="closure-status__title">
                    {closureOpen ? 'Caisse ouverte' : 'Caisse fermée'}
                </h2>
                <p className="closure-status__text">
                    {closureOpen
                        ? `Ouverte depuis ${currentClosure ? formatDate(currentClosure.openedAt) : 'N/A'}`
                        : 'Ouvrez la caisse pour commencer une nouvelle session'}
                </p>
            </div>

            {!closureOpen ? (
                /* Open Closure Button */
                <div className="closure-actions">
                    <Button variant="secondary" size="xl" isFullWidth onClick={handleOpenClosure}>
                        🔓 Ouvrir la caisse
                    </Button>
                </div>
            ) : (
                <>
                    {/* Session Summary */}
                    <div className="closure-summary">
                        <h3 className="closure-summary__title">📊 Résumé de la session</h3>
                        <div className="closure-summary__grid">
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">Transactions</span>
                                <span className="closure-summary__value">{sessionStats.transactionCount}</span>
                            </div>
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">Total CA</span>
                                <span className="closure-summary__value closure-summary__value--highlight">
                                    {formatPrice(sessionStats.total)}
                                </span>
                            </div>
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">💵 Espèces</span>
                                <span className="closure-summary__value">{formatPrice(sessionStats.totalCash)}</span>
                            </div>
                            <div className="closure-summary__item">
                                <span className="closure-summary__label">💳 Carte</span>
                                <span className="closure-summary__value">{formatPrice(sessionStats.totalCard)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Cash Count */}
                    <div className="closure-count">
                        <h3 className="closure-count__title">💰 Comptage de caisse</h3>

                        <div className="closure-count__group">
                            <label className="closure-count__label">
                                Montant attendu (espèces)
                            </label>
                            <input
                                type="text"
                                className="closure-count__input"
                                value={formatPrice(expectedCash)}
                                disabled
                            />
                        </div>

                        <div className="closure-count__group">
                            <label className="closure-count__label">
                                Montant réel compté
                            </label>
                            <input
                                type="number"
                                className="closure-count__input"
                                step="0.01"
                                min="0"
                                value={actualAmount || ''}
                                onChange={(e) => setActualAmount(Number(e.target.value))}
                                placeholder="0,00"
                            />
                            <div className="closure-count__quick-amounts">
                                {[5, 10, 20, 50, 100].map((amount) => (
                                    <button
                                        key={amount}
                                        className="closure-count__quick-btn"
                                        onClick={() => handleQuickAmount(amount)}
                                        type="button"
                                    >
                                        +{amount} €
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="closure-count__group">
                            <label className="closure-count__label">
                                Notes / Commentaires
                            </label>
                            <textarea
                                className="closure-count__textarea"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Observations éventuelles..."
                            />
                        </div>
                    </div>

                    {/* Difference */}
                    {actualAmount > 0 && (
                        <div className={`closure-difference closure-difference--${getDifferenceClass(difference)}`}>
                            <span className="closure-difference__label">
                                {difference === 0
                                    ? '✓ Caisse équilibrée'
                                    : difference > 0
                                        ? '▲ Excédent'
                                        : '▼ Déficit'}
                            </span>
                            <span className="closure-difference__value">
                                {difference >= 0 ? '+' : ''}{formatPrice(difference)}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="closure-actions">
                        <Button variant="ghost" size="lg" onClick={handleBack}>
                            Annuler
                        </Button>
                        <Button
                            variant="secondary"
                            size="lg"
                            onClick={handleCloseClosure}
                            disabled={actualAmount <= 0}
                        >
                            🔒 Clôturer la caisse
                        </Button>
                    </div>
                </>
            )}

            {/* History */}
            {closureHistory.length > 0 && (
                <div className="closure-history">
                    <h3 className="closure-history__title">📋 Historique des clôtures</h3>
                    <div className="closure-history__list">
                        {closureHistory.map((closure) => (
                            <div key={closure.id} className="closure-history__item">
                                <div className="closure-history__item-icon">✓</div>
                                <div className="closure-history__item-info">
                                    <span className="closure-history__item-date">
                                        {closure.closedAt ? formatDate(closure.closedAt) : 'N/A'}
                                    </span>
                                    <span className="closure-history__item-user">
                                        Clôture #{closure.id}
                                    </span>
                                </div>
                                <div>
                                    <span className="closure-history__item-amount">
                                        {formatPrice(closure.actualAmount ?? 0)}
                                    </span>
                                    {closure.difference !== undefined && closure.difference !== 0 && (
                                        <span className={`closure-history__item-diff closure-history__item-diff--${getDifferenceClass(closure.difference)}`}>
                                            {closure.difference >= 0 ? '+' : ''}{formatPrice(closure.difference)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClosurePage;
