import React, { useState, useMemo } from 'react';
import { useProductStore } from '../stores';
import { PackageIcon, TrashIcon, SearchIcon, PlusIcon, AlertIcon, XIcon, CheckIcon } from '../components/ui';
import { getProductImageUrl } from '../helpers/urlHelper';
import type { Product, ProductCreateInput } from '../types';
import { ask } from '@tauri-apps/plugin-dialog';
import { logger } from '../services/logger';
import './ProductsPage.css';

export const ProductsPage: React.FC = () => {
    const {
        products,
        categories,
        addProduct,
        updateProduct,
        deleteProduct,
        toggleProductActive,
        uploadProductImage
    } = useProductStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [productForm, setProductForm] = useState<ProductCreateInput>({
        categoryId: categories[0]?.id || 1,
        name: '',
        price: 0,
        stockQuantity: 0,
        alertThreshold: 10,
        imagePath: '',
        printTicket: true
    });

    const filteredProducts = useMemo(() => {
        let result = products;
        if (selectedCategoryId) {
            result = result.filter(p => p.categoryId === selectedCategoryId);
        }
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(p => p.name.toLowerCase().includes(query));
        }
        return result;
    }, [products, selectedCategoryId, searchQuery]);

    const isPanelOpen = isCreating || editingProduct !== null;

    const handleOpenCreate = () => {
        setEditingProduct(null);
        setSelectedImageFile(null);
        setProductForm({
            categoryId: selectedCategoryId || categories[0]?.id || 1,
            name: '',
            price: 0,
            stockQuantity: 0,
            alertThreshold: 10,
            imagePath: '',
            printTicket: true
        });
        setIsCreating(true);
    };

    const handleOpenEdit = (product: Product) => {
        setIsCreating(false);
        setSelectedImageFile(null);
        setEditingProduct(product);
        setProductForm({
            categoryId: product.categoryId,
            name: product.name,
            price: product.price,
            stockQuantity: product.stockQuantity,
            alertThreshold: product.alertThreshold,
            imagePath: product.imagePath || '',
            printTicket: product.printTicket ?? true
        });
    };

    const handleClosePanel = () => {
        setEditingProduct(null);
        setIsCreating(false);
        setSelectedImageFile(null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedImageFile(file);
            setProductForm({ ...productForm, imagePath: URL.createObjectURL(file) });
        }
    };

    const handleSave = async () => {
        if (!productForm.name) {
            alert("Veuillez entrer un nom de produit");
            return;
        }
        if (Number.isNaN(productForm.price) || productForm.price <= 0) {
            alert("Le prix doit être supérieur à 0");
            return;
        }

        setIsSaving(true);
        try {
            let finalImagePath = productForm.imagePath;

            if (selectedImageFile) {
                try {
                    finalImagePath = await uploadProductImage(selectedImageFile);
                    await logger.info('Product image uploaded successfully', { name: selectedImageFile.name, path: finalImagePath });
                } catch (error) {
                    console.error("Upload failed:", error);
                    await logger.error("Product image upload failed", error, { name: selectedImageFile.name });
                    finalImagePath = editingProduct?.imagePath || '';
                }
            } else if (finalImagePath?.startsWith('blob:')) {
                finalImagePath = editingProduct?.imagePath || '';
            }

            const productData = { ...productForm, imagePath: finalImagePath };

            if (editingProduct) {
                updateProduct(editingProduct.id, productData);
                await logger.info('Product updated', { id: editingProduct.id, name: productData.name });
            } else {
                addProduct(productData);
                await logger.info('Product created', { name: productData.name });
            }

            handleClosePanel();
        } catch (error) {
            console.error("Save error:", error);
            await logger.error("Product save failed", error);
            alert("Erreur lors de l'enregistrement");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        const confirmed = await ask('Êtes-vous sûr de vouloir supprimer ce produit ?', {
            title: 'Confirmation de suppression',
            kind: 'warning',
            okLabel: 'Oui, supprimer',
            cancelLabel: 'Non, annuler'
        });

        if (confirmed) {
            deleteProduct(id);
            await logger.info('Product deleted', { id });
            if (editingProduct?.id === id) {
                handleClosePanel();
            }
        }
    };

    const getCategory = (id: number) => categories.find(c => c.id === id);

    return (
        <div className={`products-page ${isPanelOpen ? 'products-page--panel-open' : ''}`}>
            {/* Main Content Area */}
            <div className="products-main">
                {/* Header */}
                <div className="products-header">
                    <div className="products-title">
                        <h1>Catalogue Produits</h1>
                        <p>{filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={handleOpenCreate} className="btn-primary">
                        <PlusIcon size={20} />
                        Nouveau
                    </button>
                </div>

                {/* Filters */}
                <div className="products-filters">
                    <div className="search-wrapper">
                        <div className="search-icon">
                            <SearchIcon size={20} />
                        </div>
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                    </div>

                    <div className="category-filters">
                        <button
                            onClick={() => setSelectedCategoryId(null)}
                            className={`filter-btn ${selectedCategoryId === null ? 'filter-btn--active' : ''}`}
                        >
                            Tout
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className={`filter-btn ${selectedCategoryId === cat.id ? 'filter-btn--active' : ''}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Products Grid */}
                <div className="products-grid">
                    {filteredProducts.map(product => {
                        const category = getCategory(product.categoryId);
                        const isLowStock = product.stockQuantity <= product.alertThreshold;
                        const isSelected = editingProduct?.id === product.id;

                        return (
                            <div
                                key={product.id}
                                className={`product-card ${!product.isActive ? 'product-card--inactive' : ''} ${isSelected ? 'product-card--selected' : ''}`}
                                onClick={() => handleOpenEdit(product)}
                            >
                                {/* Image */}
                                <div className="product-card__image-wrapper">
                                    {product.imagePath ? (
                                        <img
                                            src={getProductImageUrl(product.imagePath)}
                                            alt={product.name}
                                            className="product-card__image"
                                            onError={(e) => {
                                                e.currentTarget.src = "https://placehold.co/120x120/f8fafc/cbd5e1?text=Image";
                                            }}
                                        />
                                    ) : (
                                        <div className="product-card__image-placeholder">
                                            <PackageIcon size={32} />
                                        </div>
                                    )}
                                    {isLowStock && product.isActive && (
                                        <span className="product-card__alert" title="Stock faible">
                                            <AlertIcon size={14} />
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="product-card__info">
                                    <span
                                        className="product-card__category"
                                        style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                                    >
                                        {category?.name}
                                    </span>
                                    <h3 className="product-card__name">{product.name}</h3>
                                    <div className="product-card__meta">
                                        <span className="product-card__price">{product.price.toFixed(2)} €</span>
                                        <span className={`product-card__stock ${isLowStock ? 'product-card__stock--low' : ''}`}>
                                            {product.stockQuantity} en stock
                                        </span>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="product-card__actions">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleProductActive(product.id); }}
                                        className={`product-card__toggle ${product.isActive ? 'toggle--active' : ''}`}
                                        title={product.isActive ? 'Désactiver' : 'Activer'}
                                    >
                                        {product.isActive ? <CheckIcon size={14} /> : <XIcon size={14} />}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                                        className="product-card__delete"
                                        title="Supprimer"
                                    >
                                        <TrashIcon size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Side Panel for Edit/Create */}
            <div className={`products-panel ${isPanelOpen ? 'products-panel--open' : ''}`}>
                <div className="panel-header">
                    <h2>{editingProduct ? 'Modifier' : 'Nouveau produit'}</h2>
                    <button onClick={handleClosePanel} className="panel-close">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="panel-content">
                    {/* Image Upload */}
                    <div className="panel-image-section">
                        <div className="panel-image-preview">
                            {productForm.imagePath ? (
                                <img
                                    src={productForm.imagePath.startsWith('blob:') ? productForm.imagePath : getProductImageUrl(productForm.imagePath)}
                                    alt="Preview"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : (
                                <PackageIcon size={48} />
                            )}
                        </div>
                        <label className="panel-image-upload">
                            <input type="file" accept="image/*" onChange={handleImageChange} />
                            <span>Changer l'image</span>
                        </label>
                    </div>

                    {/* Form Fields */}
                    <div className="panel-form">
                        <div className="form-group">
                            <label className="form-label">Nom du produit</label>
                            <input
                                type="text"
                                value={productForm.name}
                                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                className="form-input"
                                placeholder="Ex: Burger Maison"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Catégorie</label>
                            <select
                                value={productForm.categoryId}
                                onChange={(e) => setProductForm({ ...productForm, categoryId: parseInt(e.target.value) })}
                                className="form-input"
                            >
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Prix (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={productForm.price}
                                    onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Stock</label>
                                <input
                                    type="number"
                                    value={productForm.stockQuantity}
                                    onChange={(e) => setProductForm({ ...productForm, stockQuantity: parseInt(e.target.value) || 0 })}
                                    className="form-input"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Seuil d'alerte stock</label>
                            <input
                                type="number"
                                value={productForm.alertThreshold}
                                onChange={(e) => setProductForm({ ...productForm, alertThreshold: parseInt(e.target.value) || 0 })}
                                className="form-input"
                            />
                        </div>

                        <label className="form-checkbox">
                            <input
                                type="checkbox"
                                checked={productForm.printTicket ?? true}
                                onChange={(e) => setProductForm({ ...productForm, printTicket: e.target.checked })}
                            />
                            <div className="form-checkbox__label">
                                <span className="form-checkbox__title">Imprimer ticket cuisine</span>
                                <span className="form-checkbox__desc">Ce produit apparaîtra sur l'imprimante</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="panel-footer">
                    <button onClick={handleClosePanel} className="btn-secondary" disabled={isSaving}>
                        Annuler
                    </button>
                    <button onClick={handleSave} className="btn-primary" disabled={isSaving}>
                        {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
};
