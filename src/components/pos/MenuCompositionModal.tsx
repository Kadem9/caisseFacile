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
    onConfirm: (menu: Menu, selectedProducts: { componentId: number; product: Product }[]) => void;
    onClose: () => void;
}

export const MenuCompositionModal: React.FC<MenuCompositionModalProps> = ({
    menu,
    products,
    onConfirm,
    onClose,
}) => {
    const [activeStep, setActiveStep] = useState(0);
    const [selections, setSelections] = useState<Map<number, Product>>(new Map());

    const currentComponent = menu.components?.[activeStep];
    const totalSteps = menu.components?.length || 0;

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
        const newSelections = new Map(selections);
        newSelections.set(componentId, product);
        setSelections(newSelections);
    };


    const handleConfirm = () => {
        const selectedProducts = Array.from(selections.entries()).map(([componentId, product]) => ({
            componentId,
            product,
        }));
        onConfirm(menu, selectedProducts);
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
        return selections.has(component.id);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="menu-composition-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{menu.name}</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <XIcon size={24} />
                    </button>
                </div>

                <div className="menu-total-bar">
                    <span className="menu-total-label">Prix du menu</span>
                    <span className="menu-total-value">{menu.price.toFixed(2)} €</span>
                </div>

                <div className="menu-stepper-progress">
                    <div className="stepper-track">
                        <div
                            className="stepper-fill"
                            style={{ width: `${((activeStep + 1) / totalSteps) * 100}%` }}
                        ></div>
                    </div>
                    <div className="stepper-info">
                        <span>Étape {activeStep + 1} sur {totalSteps}</span>
                        <strong>{currentComponent.label}</strong>
                    </div>
                </div>

                <div className="menu-components-list">
                    <div key={currentComponent.id} className="menu-component-section active">
                        <h3 className="component-title">
                            Choisissez votre {currentComponent.label}
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
                                    const isSelected = selections.get(currentComponent.id)?.id === product.id;
                                    const imageUrl = getProductImageUrl(product.imagePath);
                                    const isLowStock = product.stockQuantity <= product.alertThreshold;
                                    const isOutOfStock = product.stockQuantity <= 0;

                                    return (
                                        <button
                                            key={product.id}
                                            className={`product-option ${isSelected ? 'selected' : ''} ${imageUrl ? 'has-image' : ''}`}
                                            onClick={() => {
                                                if (isOutOfStock) {
                                                    alert(`${product.name} est en rupture de stock !`);
                                                    return;
                                                }
                                                handleProductSelect(currentComponent.id, product);
                                            }}
                                            disabled={isOutOfStock}
                                            style={{ opacity: isOutOfStock ? 0.5 : 1 }}
                                        >
                                            {imageUrl && (
                                                <div className="product-option-image">
                                                    <img src={imageUrl} alt={product.name} />
                                                </div>
                                            )}
                                            <div className="product-option-name">{product.name}</div>
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
                                        </button>
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
                        {activeStep < totalSteps - 1 ? 'Suivant' : `Ajouter au panier (${menu.price.toFixed(2)} €)`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MenuCompositionModal;
