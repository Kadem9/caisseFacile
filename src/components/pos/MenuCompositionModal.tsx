// ===================================
// MenuCompositionModal - Menu Builder for POS
// ===================================

import React, { useState } from 'react';
import { XIcon } from '../ui';
import { getProductImageUrl } from '../../helpers/urlHelper';
import type { Menu, Product } from '../../types';
import './MenuCompositionModal.css';

interface MenuCompositionModalProps {
    menu: Menu;
    products: Product[];
    onConfirm: (menu: Menu, selections: { componentId: number; product: Product }[][]) => void;
    onClose: () => void;
}

export const MenuCompositionModal: React.FC<MenuCompositionModalProps> = ({
    menu,
    products,
    onConfirm,
    onClose,
}) => {
    const [activeStep, setActiveStep] = useState(0);
    const [selections, setSelections] = useState<Map<number, Product[]>>(new Map());
    const [menuQuantity, setMenuQuantity] = useState(1);

    const currentComponent = menu.components?.[activeStep];
    const totalSteps = menu.components?.length || 0;

    // Helper to get number of items selected for current step
    const getSelectionCount = (componentId: number) => {
        return selections.get(componentId)?.length || 0;
    };

    // Helper to get number of specific product selected for current step
    const getProductSelectionCount = (componentId: number, productId: number) => {
        const selectedForComponent = selections.get(componentId) || [];
        return selectedForComponent.filter(p => p.id === productId).length;
    };

    // Early return if no components
    if (!currentComponent || totalSteps === 0) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="menu-composition-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h2>{menu.name}</h2>
                        <button className="btn-icon" onClick={onClose}>
                            <XIcon size={24} />
                        </button>
                    </div>
                    <div className="menu-components-list" style={{ padding: '2rem', textAlign: 'center' }}>
                        <p>Ce menu n'a pas de composants configurés.</p>
                    </div>
                    <div className="modal-actions">
                        <button className="btn btn--secondary btn--xl" onClick={onClose} type="button">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleProductSelect = (componentId: number, product: Product) => {
        const currentSelections = selections.get(componentId) || [];

        // Check if we already reached the required quantity
        if (currentSelections.length >= menuQuantity) {
            // Maybe alert or just return?
            // User might want to replace?
            // For now, strict addition logic. If full, don't add.
            return;
        }

        const newSelections = new Map(selections);
        newSelections.set(componentId, [...currentSelections, product]);
        setSelections(newSelections);
    };

    const handleProductRemove = (componentId: number, product: Product) => {
        const currentSelections = selections.get(componentId) || [];
        const index = currentSelections.findIndex(p => p.id === product.id);

        if (index > -1) {
            const newSelections = new Map(selections);
            const newArray = [...currentSelections];
            newArray.splice(index, 1);
            newSelections.set(componentId, newArray);
            setSelections(newSelections);
        }
    };


    const handleConfirm = () => {
        // Generate 'menuQuantity' separate menu items
        // We assume we have `menuQuantity` selections for each component (validated by nextStep logic)

        const allMenus: { componentId: number; product: Product }[][] = [];

        for (let i = 0; i < menuQuantity; i++) {
            const singleMenuSelections = (menu.components || []).map(comp => {
                const stepSelections = selections.get(comp.id) || [];
                // Fallback: use the last selected item if index out of bounds (shouldn't happen with valid logic)
                // Or better: Use modulo if we want to support "1 selection applying to all" (not in this spec)
                // In "Bulk Mode", user MUST select N items.
                const product = stepSelections[i] || stepSelections[0]; // Fallback to 0 just in case
                return {
                    componentId: comp.id,
                    product
                };
            });
            allMenus.push(singleMenuSelections);
        }

        onConfirm(menu, allMenus);
    };

    const nextStep = () => {
        if (activeStep < totalSteps - 1) {
            setActiveStep(prev => prev + 1);
        } else {
            handleConfirm();
        }
    };

    const prevStep = () => {
        if (activeStep > 0) {
            setActiveStep(prev => prev - 1);
        }
    };

    const isStepComplete = (stepIdx: number) => {
        const component = menu.components?.[stepIdx];
        if (!component || !component.isRequired) return true;
        // Require exact quantity match for bulk mode
        return (selections.get(component.id)?.length || 0) === menuQuantity;
    };

    const currentSelectionCount = getSelectionCount(currentComponent.id);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="menu-composition-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{menu.name}</h2>
                    {/* Quantity Selector in Header */}
                    <div className="menu-quantity-selector">
                        <span style={{ fontWeight: 'bold' }}>Quantité :</span>
                        <button
                            className="menu-quantity-btn"
                            onClick={() => {
                                if (menuQuantity > 1) {
                                    setMenuQuantity(q => q - 1);
                                    // Should we clear selections? Or truncate?
                                    // Truncate logic:
                                    const newSelections = new Map<number, Product[]>();
                                    selections.forEach((prods, compId) => {
                                        if (prods.length > menuQuantity - 1) {
                                            newSelections.set(compId, prods.slice(0, menuQuantity - 1));
                                        } else {
                                            newSelections.set(compId, prods);
                                        }
                                    });
                                    setSelections(newSelections);
                                }
                            }}
                            disabled={menuQuantity <= 1}
                        > - </button>
                        <span className="menu-quantity-value">{menuQuantity}</span>
                        <button
                            className="menu-quantity-btn"
                            onClick={() => setMenuQuantity(q => q + 1)}
                        > + </button>
                    </div>

                    <button className="btn-icon" onClick={onClose}>
                        <XIcon size={24} />
                    </button>
                </div>

                <div className="menu-total-bar">
                    <span className="menu-total-label">Prix Total ({menuQuantity} menus)</span>
                    <span className="menu-total-value">{(menu.price * menuQuantity).toFixed(2)} €</span>
                </div>

                <div className="menu-stepper-progress">
                    <div className="stepper-track">
                        <div
                            className="stepper-fill"
                            style={{ width: `${((activeStep + (currentSelectionCount / menuQuantity)) / totalSteps) * 100}%` }}
                        // This is a rough visualization: Step progress + fraction of current step
                        ></div>
                    </div>
                    <div className="stepper-info">
                        <span>Étape {activeStep + 1} sur {totalSteps}</span>
                        <strong>{currentComponent.label} ({currentSelectionCount} / {menuQuantity})</strong>
                    </div>
                </div>

                <div className="menu-components-list">
                    <div key={currentComponent.id} className="menu-component-section active">
                        <h3 className="component-title">
                            Choisissez vos {currentComponent.label}
                            {currentComponent.isRequired && <span className="required-badge">Obligatoire</span>}
                        </h3>

                        <div className="product-grid">
                            {products
                                .filter(p =>
                                    p.categoryId === currentComponent.categoryId &&
                                    p.isActive &&
                                    (currentComponent.allowedProductIds?.includes(p.id) || !currentComponent.allowedProductIds?.length)
                                )
                                .map((product) => {
                                    const count = getProductSelectionCount(currentComponent.id, product.id);
                                    const imageUrl = getProductImageUrl(product.imagePath);
                                    const isLowStock = product.stockQuantity <= product.alertThreshold;
                                    const isOutOfStock = product.stockQuantity <= 0;
                                    const isStepFull = currentSelectionCount >= menuQuantity;

                                    return (
                                        <div
                                            key={product.id}
                                            className={`product-option ${count > 0 ? 'selected' : ''} ${imageUrl ? 'has-image' : ''}`}
                                            // Make the whole card clickable for simple add if not using buttons?
                                            // Let's keep it clickable but maybe add +/- buttonsOverlay if selected
                                            style={{ position: 'relative', overflow: 'hidden' }}
                                        >
                                            <button
                                                className="product-option-click-target"
                                                style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                                                onClick={() => {
                                                    if (isOutOfStock) {
                                                        alert(`${product.name} est en rupture de stock !`);
                                                        return;
                                                    }
                                                    if (!isStepFull) {
                                                        handleProductSelect(currentComponent.id, product);
                                                    }
                                                }}
                                                disabled={isOutOfStock}
                                            >
                                                {imageUrl && (
                                                    <div className="product-option-image">
                                                        <img src={imageUrl} alt={product.name} />
                                                    </div>
                                                )}
                                                <div className="product-option-name">{product.name}</div>
                                            </button>

                                            {/* Quantity Badge / Controls */}
                                            {/* Quantity Badge / Controls - Bottom Bar */}
                                            {count > 0 && (
                                                <div className="product-qty-overlay">
                                                    <button
                                                        className="product-qty-btn"
                                                        onClick={(e) => { e.stopPropagation(); handleProductRemove(currentComponent.id, product); }}
                                                    >-</button>
                                                    <span className="product-qty-value">{count}</span>
                                                    <button
                                                        className="product-qty-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!isStepFull) handleProductSelect(currentComponent.id, product);
                                                        }}
                                                        disabled={isStepFull}
                                                    >+</button>
                                                </div>
                                            )}

                                            {isLowStock && !isOutOfStock && (
                                                <span className="product-option-badge product-option-badge--warning">
                                                    Stock bas ({product.stockQuantity})
                                                </span>
                                            )}
                                            {isOutOfStock && (
                                                <span className="product-option-badge product-option-badge--danger">
                                                    Rupture
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="btn btn--secondary btn--xl"
                        onClick={activeStep === 0 ? onClose : prevStep}
                        type="button"
                    >
                        {activeStep === 0 ? 'Annuler' : 'Précédent'}
                    </button>
                    <button
                        className="btn btn--primary btn--xl"
                        onClick={nextStep}
                        disabled={!isStepComplete(activeStep)}
                        type="button"
                    >
                        {activeStep < totalSteps - 1 ? 'Suivant' : `Ajouter au panier (${(menu.price * menuQuantity).toFixed(2)} €)`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MenuCompositionModal;
