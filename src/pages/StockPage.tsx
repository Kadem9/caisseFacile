// ===================================
// Stock Page - Stock Management Interface
// ===================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Button,
    PackageIcon,
    PlusIcon,
    MinusIcon
} from '../components/ui';
import { useProductStore, useStockStore, useAuthStore, useSyncStore } from '../stores';
import { getStockMovements as fetchStockMovements, createStockMovement, type StockMovementData } from '../services/api';
import type { Product, StockMovementType, StockMovement } from '../types';
import './StockPage.css';

type FilterType = 'all' | 'low' | 'critical';

export const StockPage: React.FC = () => {
    const { currentUser } = useAuthStore();
    const { products, categories, updateStock } = useProductStore();
    const { addMovement, getMovementsByProduct } = useStockStore();

    // State
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [movementType, setMovementType] = useState<'in' | 'out'>('in');
    const [quantity, setQuantity] = useState<number>(0);
    const [reason, setReason] = useState<string>('');
    const [backendMovements, setBackendMovements] = useState<StockMovementData[]>([]);
    const [_isLoading, setIsLoading] = useState(false);

    // Fetch stock movements from backend when product is selected
    useEffect(() => {
        if (!selectedProduct) {
            setBackendMovements([]);
            return;
        }

        const fetchMovements = async () => {
            try {
                setIsLoading(true);
                const data = await fetchStockMovements({
                    productId: selectedProduct.id,
                    limit: 50
                });
                setBackendMovements(data.movements);
            } catch (err) {
                console.error('Failed to fetch stock movements:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMovements();
    }, [selectedProduct]);

    // Use backend movements if available, fallback to local
    const productMovements = selectedProduct
        ? (backendMovements.length > 0 ? backendMovements : getMovementsByProduct(selectedProduct.id))
        : [];

    // Filtered products
    const filteredProducts = useMemo(() => {
        switch (filter) {
            case 'low':
                return products.filter(
                    p => p.isActive && p.stockQuantity > 0 && p.stockQuantity <= p.alertThreshold
                );
            case 'critical':
                return products.filter(p => p.isActive && p.stockQuantity === 0);
            default:
                return products.filter(p => p.isActive);
        }
    }, [products, filter]);

    const lowStockCount = useMemo(() =>
        products.filter(p => p.isActive && p.stockQuantity > 0 && p.stockQuantity <= p.alertThreshold).length,
        [products]
    );

    const criticalStockCount = useMemo(() =>
        products.filter(p => p.isActive && p.stockQuantity === 0).length,
        [products]
    );

    // Handlers

    const getCategoryName = useCallback((categoryId: number) => {
        return categories.find(c => c.id === categoryId)?.name || '';
    }, [categories]);

    const getCategoryIcon = useCallback((categoryId: number): React.ReactNode => {
        return categories.find(c => c.id === categoryId)?.icon || <PackageIcon size={24} color="#ccc" />;
    }, [categories]);

    const getStockStatus = (product: Product) => {
        if (product.stockQuantity === 0) return 'critical';
        if (product.stockQuantity <= product.alertThreshold) return 'low';
        return 'ok';
    };

    const getStockLabel = (product: Product) => {
        const status = getStockStatus(product);
        switch (status) {
            case 'critical': return 'Rupture';
            case 'low': return 'Stock bas';
            default: return 'OK';
        }
    };

    const handleSelectProduct = useCallback((product: Product) => {
        setSelectedProduct(product);
        setQuantity(0);
        setReason('');
        setMovementType('in');
    }, []);

    const handleSubmitMovement = useCallback(async () => {
        if (!selectedProduct || !currentUser || quantity <= 0) return;

        // Prepare movement data
        const movementData = {
            productId: selectedProduct.id,
            userId: currentUser.id,
            type: movementType,
            quantity,
            reason: reason || undefined,
        };

        // Calculate new stock
        const newStock = movementType === 'in'
            ? selectedProduct.stockQuantity + quantity
            : Math.max(0, selectedProduct.stockQuantity - quantity);

        // Always update local store first for UI feedback
        addMovement({
            productId: selectedProduct.id,
            userId: currentUser.id,
            type: movementType as StockMovementType,
            quantity,
            reason: reason || undefined,
        });
        updateStock(selectedProduct.id, newStock);
        setSelectedProduct({
            ...selectedProduct,
            stockQuantity: newStock,
        });

        // Reset form
        setQuantity(0);
        setReason('');

        // Now try to sync with backend
        try {
            const { checkConnection, addToQueue } = useSyncStore.getState();
            const isOnline = await checkConnection();

            if (isOnline) {
                // Try to save to backend
                const result = await createStockMovement(movementData);
                console.log('[Stock] Movement synced to backend:', result);

                // Refresh movements from backend
                const data = await fetchStockMovements({
                    productId: selectedProduct.id,
                    limit: 50
                });
                setBackendMovements(data.movements);
            } else {
                // Offline: Queue for later sync
                console.log('[Stock] Offline mode - queuing movement for later sync');
                addToQueue('stock_movement', { ...movementData, id: Date.now(), createdAt: new Date() } as unknown as StockMovement);
            }
        } catch (err) {
            // Network error: Queue for later sync
            console.warn('[Stock] Network error, queuing movement:', err);
            const { addToQueue } = useSyncStore.getState();
            addToQueue('stock_movement', { ...movementData, id: Date.now() } as unknown as StockMovement);
        }
    }, [selectedProduct, currentUser, quantity, movementType, reason, addMovement, updateStock]);

    const selectedMovements = useMemo(() => {
        if (!selectedProduct) return [];
        return productMovements.slice(0, 5);
    }, [selectedProduct, productMovements]);

    const formatDate = (date: Date) => {
        const d = new Date(date);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="stock-page">
            {/* Header */}
            <header className="stock-header">
                <div className="stock-title">
                    <h1>Gestion des Stocks</h1>
                    <p>{products.filter(p => p.isActive).length} produits</p>
                </div>
            </header>

            <main className="stock-main">
                {/* Stock List */}
                <section className="stock-list">
                    <div className="stock-toolbar">
                        <div className="stock-filters">
                            <button
                                className={`stock-filter ${filter === 'all' ? 'stock-filter--active' : ''}`}
                                onClick={() => setFilter('all')}
                                type="button"
                            >
                                Tous ({products.filter(p => p.isActive).length})
                            </button>
                            <button
                                className={`stock-filter stock-filter--warning ${filter === 'low' ? 'stock-filter--active' : ''}`}
                                onClick={() => setFilter('low')}
                                type="button"
                            >
                                Stock bas ({lowStockCount})
                            </button>
                            <button
                                className={`stock-filter ${filter === 'critical' ? 'stock-filter--active' : ''}`}
                                onClick={() => setFilter('critical')}
                                type="button"
                                style={criticalStockCount > 0 ? { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' } : undefined}
                            >
                                Rupture ({criticalStockCount})
                            </button>
                        </div>
                    </div>

                    <div className="stock-grid">
                        {filteredProducts.map((product) => {
                            const status = getStockStatus(product);
                            return (
                                <div
                                    key={product.id}
                                    className={`stock-item stock-item--${status} ${selectedProduct?.id === product.id ? 'stock-item--selected' : ''}`}
                                    onClick={() => handleSelectProduct(product)}
                                >
                                    <span className="stock-item__icon">{getCategoryIcon(product.categoryId)}</span>
                                    <div className="stock-item__info">
                                        <span className="stock-item__name">{product.name}</span>
                                        <span className="stock-item__category">{getCategoryName(product.categoryId)}</span>
                                    </div>
                                    <div className="stock-item__quantity">
                                        <span className="stock-item__qty-value">{product.stockQuantity}</span>
                                        <span className="stock-item__qty-label">en stock</span>
                                    </div>
                                    <span className={`stock-item__status stock-item__status--${status}`}>
                                        {getStockLabel(product)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Stock Panel */}
                <aside className="stock-panel">
                    {selectedProduct ? (
                        <>
                            <div className="stock-panel__header">
                                <h2 className="stock-panel__title">{selectedProduct.name}</h2>
                                <p className="stock-panel__subtitle">
                                    Stock actuel : <strong>{selectedProduct.stockQuantity}</strong> •
                                    Seuil d'alerte : {selectedProduct.alertThreshold}
                                </p>
                            </div>

                            <div className="stock-panel__body">
                                <div className="movement-form__group">
                                    <label className="movement-form__label">Type de mouvement</label>
                                    <div className="movement-form__type">
                                        <button
                                            className={`movement-form__type-btn movement-form__type-btn--in ${movementType === 'in' ? 'movement-form__type-btn--active' : ''}`}
                                            onClick={() => setMovementType('in')}
                                            type="button"
                                        >
                                            <PlusIcon size={16} /> Entrée
                                        </button>
                                        <button
                                            className={`movement-form__type-btn movement-form__type-btn--out ${movementType === 'out' ? 'movement-form__type-btn--active' : ''}`}
                                            onClick={() => setMovementType('out')}
                                            type="button"
                                        >
                                            <MinusIcon size={16} /> Sortie
                                        </button>
                                    </div>
                                </div>

                                <div className="movement-form__group">
                                    <label className="movement-form__label">Quantité</label>
                                    <input
                                        type="number"
                                        className="movement-form__input"
                                        min="1"
                                        value={quantity || ''}
                                        onChange={(e) => setQuantity(Number(e.target.value))}
                                        placeholder="0"
                                    />
                                </div>

                                <div className="movement-form__group">
                                    <label className="movement-form__label">Raison (optionnel)</label>
                                    <textarea
                                        className="movement-form__textarea"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Ex: Livraison fournisseur, Casse..."
                                    />
                                </div>

                                {/* Movement History */}
                                {selectedMovements.length > 0 && (
                                    <div className="movement-history">
                                        <h3 className="movement-history__title">Historique récent</h3>
                                        <div className="movement-history__list">
                                            {selectedMovements.map((movement) => {
                                                const isEntry = movement.type === 'in' || movement.type === 'entry';
                                                const isSale = movement.type === 'sale' || movement.type === 'out' || movement.type === 'exit';
                                                const displayQty = Math.abs(movement.quantity);

                                                // Determine display reason
                                                let displayReason = movement.reason;
                                                if (isSale || movement.reason === 'Vente POS' || movement.reason === 'Vente') {
                                                    displayReason = 'Vendu en caisse';
                                                } else if (!displayReason) {
                                                    displayReason = isEntry ? 'Entrée stock' : 'Sortie stock';
                                                }

                                                return (
                                                    <div key={movement.id} className="movement-item">
                                                        <div className={`movement-item__icon movement-item__icon--${isEntry ? 'in' : 'out'}`}>
                                                            {isEntry ? <PlusIcon size={14} /> : <MinusIcon size={14} />}
                                                        </div>
                                                        <div className="movement-item__info">
                                                            <span className="movement-item__qty">
                                                                {isEntry ? '+' : '-'}{displayQty}
                                                            </span>
                                                            <span className="movement-item__reason">
                                                                {displayReason}
                                                            </span>
                                                        </div>
                                                        <span className="movement-item__date">
                                                            {formatDate(movement.createdAt)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="stock-panel__actions">
                                <Button
                                    variant="secondary"
                                    size="lg"
                                    isFullWidth
                                    onClick={handleSubmitMovement}
                                    disabled={quantity <= 0}
                                >
                                    {movementType === 'in' ? 'Ajouter au stock' : 'Retirer du stock'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="stock-panel__empty">
                            <span className="stock-panel__empty-icon">
                                <PackageIcon size={48} color="#ccc" />
                            </span>
                            <p>Sélectionnez un produit pour gérer son stock</p>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
};

export default StockPage;
