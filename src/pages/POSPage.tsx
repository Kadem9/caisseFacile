// ===================================
// POS Page - Main Cash Register Interface
// ===================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PackageIcon, ChartIcon, SettingsIcon, LogoutIcon, AlertIcon, HamburgerIcon, ShoppingCartIcon, TrashIcon, PlusIcon, MinusIcon, CardIcon } from '../components/ui';
import { PaymentModal, MenuCompositionModal } from '../components/pos';
import type { PaymentResult } from '../components/pos';
import { getProductImageUrl } from '../helpers/urlHelper';
import { useAuthStore, useCartStore, useTransactionStore, useProductStore, useMenuStore, useSyncStore } from '../stores';
import type { Menu, Product, Transaction } from '../types';
import './POSPage.css';
import logoImg from '../assets/logo-asmsp.png';

export const POSPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, logout } = useAuthStore();
    const { items, totalAmount, addItem, incrementItem, decrementItem, removeItem, clearCart } = useCartStore();
    const { addTransaction, getSessionTotal } = useTransactionStore();
    const { getActiveCategories, getLowStockProducts, decrementStock, products } = useProductStore();
    const { getActiveMenus } = useMenuStore();

    const categories = getActiveCategories();
    const menus = getActiveMenus();
    const [activeCategory, setActiveCategory] = useState<number>(categories[0]?.id || 1);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkBackend = async () => {
            try {
                await fetch('http://localhost:3001/api/stats', { method: 'HEAD' });
                setIsOnline(true);
            } catch {
                setIsOnline(false);
            }
        };
        // Check every 30s
        const interval = setInterval(checkBackend, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);
    const [activeTab, setActiveTab] = useState<'products' | 'menus'>('products');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);

    // Use useMemo to ensure filteredProducts updates when activeCategory or products change
    const filteredProducts = useMemo(() => {
        return products.filter(p => p.categoryId === activeCategory && p.isActive);
    }, [activeCategory, products]);
    const sessionTotal = getSessionTotal();
    const lowStockCount = getLowStockProducts().length;
    const { addToQueue } = useSyncStore();

    // Auto sync is now handled globally in App.tsx

    const handleProductClick = useCallback((product: Product) => {
        // Check if product is in stock
        if (product.stockQuantity <= 0) {
            alert(`${product.name} est en rupture de stock !`);
            return;
        }

        // Check if we already have this product in cart
        const cartItem = items.find(item => item.product.id === product.id);
        const currentQuantityInCart = cartItem?.quantity || 0;

        // Check if adding one more would exceed available stock
        if (currentQuantityInCart >= product.stockQuantity) {
            alert(`Stock insuffisant pour ${product.name}. Il ne reste que ${product.stockQuantity} en stock.`);
            return;
        }

        addItem(product);
    }, [addItem, items]);

    const handleMenuClick = useCallback((menu: Menu) => {
        setSelectedMenu(menu);
    }, []);

    const handleMenuCompose = useCallback((menu: Menu, selectedProducts: { componentId: number; product: Product }[]) => {
        // Create a virtual product representing the menu
        const menuProduct: Product = {
            id: menu.id + 100000, // Offset to avoid ID collision
            name: `${menu.name} (${selectedProducts.map(sp => sp.product.name).join(', ')})`,
            price: menu.price,
            categoryId: 0,
            stockQuantity: 999,
            alertThreshold: 0,
            isActive: true,
            printTicket: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        addItem(menuProduct);
        setSelectedMenu(null);
    }, [addItem]);

    const handleLogout = useCallback(() => {
        clearCart();
        logout();
        navigate('/');
    }, [clearCart, logout, navigate]);

    const handleOpenPayment = useCallback(() => {
        setIsPaymentModalOpen(true);
    }, []);

    const handleClosePayment = useCallback(() => {
        setIsPaymentModalOpen(false);
    }, []);

    const handlePaymentConfirm = useCallback(async (paymentResult: PaymentResult) => {
        if (!currentUser) return;

        // Prepare transaction data
        const transactionData = {
            userId: currentUser.id,
            totalAmount: paymentResult.totalAmount,
            paymentMethod: paymentResult.method,
            cashReceived: paymentResult.cashReceived,
            changeGiven: paymentResult.changeGiven,
            items: items.map(item => ({
                product: { id: item.product.id },
                quantity: item.quantity
            })),
            createdAt: new Date().toISOString(),
        };

        // Always save locally first (for UI and offline safety)
        const transaction = addTransaction(
            currentUser.id,
            items,
            paymentResult.totalAmount,
            paymentResult.method,
            paymentResult.cashReceived,
            paymentResult.changeGiven
        );

        // Decrement stock locally for immediate UI feedback
        items.forEach(item => {
            decrementStock(item.product.id, item.quantity);
        });

        // === HARDWARE ACTIONS ===
        const savedHardwareConfig = localStorage.getItem('ma-caisse-hardware-config');
        if (savedHardwareConfig) {
            try {
                const hardwareConfig = JSON.parse(savedHardwareConfig);
                const printerName = hardwareConfig.systemPrinterName;
                const drawerPin = hardwareConfig.drawerPin ?? 0;

                // 1. Auto-open cash drawer if payment is cash or mixed
                if (paymentResult.method === 'cash' || paymentResult.method === 'mixed') {
                    if (printerName) {
                        try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('open_drawer_via_driver', {
                                printerName,
                                pin: drawerPin,
                            });
                            console.log('[POS] Cash drawer opened automatically');
                        } catch (drawerError) {
                            console.warn('[POS] Failed to open cash drawer:', drawerError);
                        }
                    }
                }

                // 2. Print kitchen label if any product has printTicket = true
                const kitchenItems = items.filter(item => item.product.printTicket === true);
                if (kitchenItems.length > 0 && printerName) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        // Build a simple kitchen label receipt
                        const kitchenReceipt = {
                            header: '🍳 CUISINE',
                            items: kitchenItems.map(item => ({
                                name: item.product.name,
                                quantity: item.quantity,
                                unit_price: item.product.price,
                                subtotal: item.product.price * item.quantity,
                            })),
                            total: kitchenItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
                            payment_method: 'N/A',
                            footer: 'Étiquette cuisine',
                            transaction_id: transaction.id,
                            date: new Date().toLocaleString('fr-FR'),
                        };
                        await invoke('print_via_driver', {
                            printerName,
                            receipt: kitchenReceipt,
                            paperWidth: hardwareConfig.paperWidth ?? 80,
                        });
                        console.log('[POS] Kitchen label printed for', kitchenItems.length, 'items');
                    } catch (printError) {
                        console.warn('[POS] Failed to print kitchen label:', printError);
                    }
                }

                // 3. Print the complete transaction receipt
                if (printerName) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const receipt = {
                            header: 'AS MAN ISSIEUX',
                            items: items.map(item => ({
                                name: item.product.name,
                                quantity: item.quantity,
                                unit_price: item.product.price,
                                subtotal: item.product.price * item.quantity,
                            })),
                            total: paymentResult.totalAmount,
                            payment_method: paymentResult.method === 'cash' ? 'Espèces' :
                                paymentResult.method === 'card' ? 'Carte' : 'Mixte',
                            footer: 'Merci de votre visite !',
                            transaction_id: transaction.id,
                            date: new Date().toLocaleString('fr-FR'),
                            cash_received: paymentResult.cashReceived > 0 ? paymentResult.cashReceived : undefined,
                            change_given: paymentResult.changeGiven > 0 ? paymentResult.changeGiven : undefined,
                        };
                        await invoke('print_via_driver', {
                            printerName,
                            receipt,
                            paperWidth: hardwareConfig.paperWidth ?? 80,
                        });
                        console.log('[POS] Receipt printed successfully');
                    } catch (printError) {
                        console.warn('[POS] Failed to print receipt:', printError);
                    }
                }
            } catch (configError) {
                console.warn('[POS] Failed to parse hardware config:', configError);
            }
        }

        // Clear the cart
        clearCart();

        // Now try to sync with backend
        try {
            const { checkConnection } = useSyncStore.getState();
            const isOnline = await checkConnection();

            if (isOnline) {
                // Try to send to backend
                const { getApiUrl } = await import('../services/api');
                const response = await fetch(`${getApiUrl()}/api/sales`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(transactionData),
                });

                if (!response.ok) {
                    console.warn('[POS] Backend sale failed, queuing for later sync');
                    addToQueue('transaction', { ...transactionData, id: transaction.id } as unknown as Transaction);
                } else {
                    console.log('[POS] Sale synced to backend successfully');
                }
            } else {
                // Offline: Queue for later sync
                console.log('[POS] Offline mode - queuing transaction for later sync');
                addToQueue('transaction', { ...transactionData, id: transaction.id } as unknown as Transaction);
            }
        } catch (error) {
            // Network error: Queue for later sync
            console.warn('[POS] Network error, queuing transaction:', error);
            addToQueue('transaction', { ...transactionData, id: transaction.id } as unknown as Transaction);
        }
    }, [currentUser, items, addTransaction, decrementStock, clearCart, addToQueue]);


    const formatPrice = (price: number): string => {
        return price.toFixed(2).replace('.', ',') + ' €';
    };

    return (
        <div className="pos-page">
            {/* Header */}
            <header className="pos-header">
                <div className="pos-header__brand">
                    <div className="pos-header__logo-wrapper">
                        <img
                            src={logoImg}
                            alt="AS Manissieux"
                            className="pos-header__logo-img"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerText = '⚽';
                            }}
                        />
                    </div>
                    <div
                        className={`pos-header__status-badge ${isOnline ? 'status-online' : 'status-offline'}`}
                        onClick={() => window.location.reload()}
                        style={{ cursor: 'pointer' }}
                        title="Cliquer pour rafraîchir"
                    >
                        <span className="status-dot"></span>
                        {isOnline ? 'En ligne' : 'Hors ligne'}
                    </div>
                </div>

                <div className="pos-header__center">
                    <div className="pos-header__session-info">
                        <span className="label">Session :</span>
                        <span className="amount">{formatPrice(sessionTotal)}</span>
                    </div>
                    {lowStockCount > 0 && (
                        <button
                            className="pos-header__alert"
                            onClick={() => navigate('/stock')}
                            type="button"
                        >
                            <AlertIcon size={16} /> {lowStockCount} stock bas
                        </button>
                    )}
                </div>

                <div className="pos-header__right">
                    <div className="pos-header__nav">
                        {/* Nav buttons can go here if needed, but keeping it clean for now as requested */}
                        <button
                            className="pos-header__nav-btn"
                            onClick={() => navigate('/admin/dashboard')}
                            type="button"
                            title="Tableau de bord"
                        >
                            <ChartIcon size={20} />
                        </button>
                        <button
                            className="pos-header__nav-btn"
                            onClick={() => navigate('/admin/settings')}
                            type="button"
                            title="Paramètres"
                        >
                            <SettingsIcon size={20} />
                        </button>
                    </div>

                    <div className="pos-header__divider"></div>

                    <div className="pos-header__user-profile">
                        <div className="user-avatar">
                            {currentUser?.name.charAt(0)}
                        </div>
                        <span className="user-name">{currentUser?.name}</span>
                    </div>

                    <Button
                        variant="ghost"
                        size="md"
                        onClick={handleLogout}
                        className="logout-btn"
                    >
                        <LogoutIcon size={18} />
                        <span>Se déconnecter</span>
                    </Button>
                </div>
            </header>

            <main className="pos-main">
                {/* Products Panel */}
                <section className="pos-products">
                    {/* Tab Switcher */}
                    <div className="pos-products__tabs">
                        <button
                            className={`pos-products__tab-btn ${activeTab === 'products' ? 'pos-products__tab-btn--active' : ''}`}
                            onClick={() => setActiveTab('products')}
                            type="button"
                        >
                            <PackageIcon size={18} /> Produits
                        </button>
                        <button
                            className={`pos-products__tab-btn ${activeTab === 'menus' ? 'pos-products__tab-btn--active' : ''}`}
                            onClick={() => setActiveTab('menus')}
                            type="button"
                        >
                            <HamburgerIcon size={18} /> Menus
                        </button>
                    </div>

                    {activeTab === 'products' ? (
                        <>
                            {/* Category Tabs */}
                            <div className="pos-products__categories">
                                {categories.map((category) => (
                                    <button
                                        key={category.id}
                                        className={`btn btn--category ${activeCategory === category.id ? 'btn--category--active' : ''}`}
                                        onClick={() => setActiveCategory(category.id)}
                                        type="button"
                                    >
                                        <span>{category.name}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Products Grid */}
                            <div className="pos-products__grid">
                                {filteredProducts.map((product) => {
                                    const category = categories.find(c => c.id === product.categoryId);
                                    const isLowStock = product.stockQuantity <= product.alertThreshold;
                                    const isOutOfStock = product.stockQuantity <= 0;

                                    return (
                                        <button
                                            key={product.id}
                                            className="btn btn--product"
                                            onClick={() => handleProductClick(product)}
                                            type="button"
                                            disabled={isOutOfStock}
                                            style={{ opacity: isOutOfStock ? 0.5 : 1 }}
                                        >
                                            <div className="btn--product__visual">
                                                {product.imagePath ? (
                                                    <img
                                                        src={getProductImageUrl(product.imagePath)}
                                                        alt={product.name}
                                                        className="btn--product__image"
                                                    />
                                                ) : (
                                                    <span className="btn--product__icon">{category?.icon || <PackageIcon size={24} />}</span>
                                                )}
                                            </div>
                                            <span className="btn--product__name">{product.name}</span>
                                            <span className="btn--product__price">{formatPrice(product.price)}</span>
                                            {isLowStock && !isOutOfStock && (
                                                <span className="btn--product__badge btn--product__badge--warning">
                                                    Stock bas ({product.stockQuantity})
                                                </span>
                                            )}
                                            {isOutOfStock && (
                                                <span className="btn--product__badge btn--product__badge--danger">
                                                    Rupture
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        /* Menus Grid */
                        <div className="pos-products__grid">
                            {menus.map((menu) => (
                                <button
                                    key={menu.id}
                                    className="btn btn--product btn--menu"
                                    onClick={() => handleMenuClick(menu)}
                                    type="button"
                                >
                                    <div className="btn--product__visual">
                                        {menu.imagePath ? (
                                            <img
                                                src={getProductImageUrl(menu.imagePath)}
                                                alt={menu.name}
                                                className="btn--product__image"
                                            />
                                        ) : (
                                            <span className="btn--product__icon"><HamburgerIcon size={24} /></span>
                                        )}
                                    </div>
                                    <span className="btn--product__name">{menu.name}</span>
                                    <span className="btn--product__price">{formatPrice(menu.price)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {/* Cart Panel */}
                <aside className="pos-cart">
                    <div className="pos-cart__header">
                        <h2 className="pos-cart__title">Panier</h2>
                    </div>

                    {/* Cart Items */}
                    <div className="pos-cart__items">
                        {items.length === 0 ? (
                            <div className="pos-cart__empty">
                                <div className="pos-cart__empty-icon">
                                    <ShoppingCartIcon size={64} />
                                </div>
                                <p>Panier vide</p>
                            </div>
                        ) : (
                            items.map((item) => (
                                <div key={item.product.id} className="pos-cart__item">
                                    {item.product.imagePath ? (
                                        <div className="pos-cart__item-image-wrapper">
                                            <img
                                                src={getProductImageUrl(item.product.imagePath)}
                                                alt={item.product.name}
                                                className="pos-cart__item-image"
                                            />
                                        </div>
                                    ) : (
                                        <div className="pos-cart__item-image-wrapper pos-cart__item-image-placeholder">
                                            <PackageIcon size={24} color="#94a3b8" />
                                        </div>
                                    )}
                                    <div className="pos-cart__item-details">
                                        <div className="pos-cart__item-name">{item.product.name}</div>
                                        <div className="pos-cart__item-unit-price">{formatPrice(item.product.price)} / unité</div>
                                        <div className="pos-cart__item-total-price">{formatPrice(item.subtotal)}</div>
                                    </div>

                                    <div className="pos-cart__item-controls">
                                        <button
                                            className="pos-cart__item-btn"
                                            onClick={() => decrementItem(item.product.id)}
                                            type="button"
                                        >
                                            <MinusIcon size={16} />
                                        </button>
                                        <span className="pos-cart__item-qty">{item.quantity}</span>
                                        <button
                                            className="pos-cart__item-btn"
                                            onClick={() => incrementItem(item.product.id)}
                                            type="button"
                                        >
                                            <PlusIcon size={16} />
                                        </button>
                                        <button
                                            className="pos-cart__item-btn pos-cart__item-btn--danger"
                                            onClick={() => removeItem(item.product.id)}
                                            type="button"
                                        >
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Cart Footer */}
                    <div className="pos-cart__footer">
                        <div className="pos-cart__total-row">
                            <span className="pos-cart__total-label">Total</span>
                            <span className="pos-cart__total-amount">{formatPrice(totalAmount)}</span>
                        </div>

                        <div className="pos-cart__actions">
                            <Button
                                variant="ghost"
                                className="pos-cart__clear-btn-large"
                                onClick={clearCart}
                                disabled={items.length === 0}
                                title="Vider le panier"
                            >
                                <TrashIcon size={20} />
                            </Button>
                            <Button
                                variant="primary"
                                className="pos-cart__pay-btn-large"
                                onClick={handleOpenPayment}
                                disabled={items.length === 0}
                            >
                                <CardIcon size={24} />
                                <span>Encaisser</span>
                            </Button>
                        </div>
                    </div>
                </aside>
            </main>

            {/* Payment Modal */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                totalAmount={totalAmount}
                cartItems={items}
                onConfirm={handlePaymentConfirm}
                onCancel={handleClosePayment}
                sellerName={currentUser?.name}
            />

            {/* Menu Composition Modal */}
            {selectedMenu && (
                <MenuCompositionModal
                    menu={selectedMenu}
                    products={products}
                    onConfirm={handleMenuCompose}
                    onClose={() => setSelectedMenu(null)}
                />
            )}
        </div>
    );
};

export default POSPage;
