import React, { useState, useMemo } from 'react';
import { useProductStore } from '../stores';
import { PackageIcon, EditIcon, TrashIcon, SearchIcon, PlusIcon, AlertIcon } from '../components/ui';
import { getProductImageUrl } from '../helpers/urlHelper';
import type { Product, ProductCreateInput } from '../types';
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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

    const handleOpenModal = (product?: Product) => {
        setSelectedImageFile(null);
        setIsSaving(false);
        if (product) {
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
        } else {
            setEditingProduct(null);
            setProductForm({
                categoryId: selectedCategoryId || categories[0]?.id || 1,
                name: '',
                price: 0,
                stockQuantity: 0,
                alertThreshold: 10,
                imagePath: '',
                printTicket: true
            });
        }
        setIsModalOpen(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedImageFile(file);
            // Create a temporary preview URL
            setProductForm({ ...productForm, imagePath: URL.createObjectURL(file) });
        }
    };

    const handleSave = async () => {
        console.log("Handle Save called", productForm);

        if (!productForm.name) {
            alert("Erreur: Veuillez entrer un nom de produit");
            return;
        }

        if (Number.isNaN(productForm.price) || productForm.price <= 0) {
            alert("Erreur: Le prix est in valide ou doit être supérieur à 0");
            return;
        }

        setIsSaving(true);
        try {
            let finalImagePath = productForm.imagePath;

            // Note: Actual image upload logic will be connected here
            if (selectedImageFile) {
                console.log("Starting upload for:", selectedImageFile.name);
                try {
                    finalImagePath = await uploadProductImage(selectedImageFile);
                    console.log("Upload success, path:", finalImagePath);
                    alert("Image uploadée avec succès !");
                } catch (error) {
                    console.error("Upload failed details:", error);
                    alert("Échec de l'upload de l'image. Le produit sera enregistré sans nouvelle image.\nErreur: " + (error instanceof Error ? error.message : String(error)));
                    // Fallback to existing image or empty, DO NOT save the blob
                    finalImagePath = editingProduct?.imagePath || '';
                }
            } else {
                // No new file selected, ensure we don't save a blob if it somehow got there
                if (finalImagePath?.startsWith('blob:')) {
                    finalImagePath = editingProduct?.imagePath || '';
                }
            }

            const productData = { ...productForm, imagePath: finalImagePath }; // Use the fresh path (backend URL) or fallback

            if (editingProduct) {
                updateProduct(editingProduct.id, productData);
            } else {
                addProduct(productData);
            }

            setIsModalOpen(false);
        } catch (globalError) {
            console.error("Critical error in handleSave:", globalError);
            alert("Une erreur critique est survenue lors de l'enregistrement: " + String(globalError));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: number) => {
        if (confirm('Supprimer ce produit ?')) {
            deleteProduct(id);
        }
    };

    const getCategory = (id: number) => categories.find(c => c.id === id);

    return (
        <div className="products-page">
            {/* Header */}
            <div className="products-header">
                <div className="products-title">
                    <h1>Catalogue Produits</h1>
                    <p>Gérez vos articles, prix et stocks</p>
                </div>
                <div className="products-actions">
                    <button
                        onClick={() => handleOpenModal()}
                        className="btn-primary"
                    >
                        <PlusIcon size={20} />
                        Nouveau Produit
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="products-filters">
                <div className="search-wrapper">
                    <div className="search-icon">
                        <SearchIcon size={20} />
                    </div>
                    <input
                        type="text"
                        placeholder="Rechercher un produit..."
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

                    return (
                        <div key={product.id} className={`product-card ${!product.isActive ? 'product-card--inactive' : ''}`}>
                            <div className="product-card__content">
                                <div className="product-card__header">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="product-card__category"
                                            style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                                        >
                                            {category?.name}
                                        </span>
                                        {isLowStock && product.isActive && (
                                            <span className="text-amber-500" title="Stock faible">
                                                <AlertIcon size={16} />
                                            </span>
                                        )}
                                    </div>
                                    <div className="product-card__actions">
                                        <button
                                            onClick={() => handleOpenModal(product)}
                                            className="product-card__action-btn"
                                        >
                                            <EditIcon size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id)}
                                            className="product-card__action-btn product-card__action-btn--danger"
                                        >
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Debug: Show URL */}
                                <div style={{ fontSize: '10px', color: 'red', wordBreak: 'break-all' }}>
                                    {product.imagePath ? product.imagePath.substring(0, 50) + '...' : 'No Path'}
                                </div>

                                {product.imagePath ? (
                                    <div className="flex flex-col gap-1">
                                        <div style={{ fontSize: '9px', color: 'blue', wordBreak: 'break-all' }}>
                                            Raw: {product.imagePath}
                                        </div>
                                        <div style={{ fontSize: '9px', color: 'green', wordBreak: 'break-all' }}>
                                            URL: {getProductImageUrl(product.imagePath)}
                                        </div>
                                        <img
                                            src={getProductImageUrl(product.imagePath)}
                                            alt={product.name}
                                            className="product-card__image"
                                            style={{ minHeight: '100px', background: '#f0f0f0', border: '2px solid red' }}
                                            onLoad={(e) => {
                                                console.log('✅ IMAGE LOADED:', product.name, getProductImageUrl(product.imagePath));
                                                e.currentTarget.style.border = '2px solid green';
                                            }}
                                            onError={(e) => {
                                                console.error('❌ IMAGE FAILED:', {
                                                    product: product.name,
                                                    rawPath: product.imagePath,
                                                    resolvedURL: getProductImageUrl(product.imagePath),
                                                    error: e
                                                });
                                                e.currentTarget.src = "https://placehold.co/100x100?text=ERROR";
                                                e.currentTarget.style.border = '2px solid orange';
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="product-card__image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <PackageIcon size={24} color="#ccc" />
                                    </div>
                                )}

                                <h3 className="product-card__name">{product.name}</h3>
                                <div className="product-card__price">{product.price.toFixed(2)} €</div>

                                <div className="product-card__footer">
                                    <div className={`product-card__stock ${isLowStock ? 'product-card__stock--low' : ''}`}>
                                        Stock: {product.stockQuantity}
                                    </div>
                                    <button
                                        onClick={() => toggleProductActive(product.id)}
                                        className={`product-card__status ${product.isActive ? 'status--active' : 'status--inactive'}`}
                                    >
                                        {product.isActive ? 'Actif' : 'Hors ligne'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
                            </h2>
                        </div>

                        <div className="modal-form">
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

                            <div className="form-row">
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
                                <div className="form-group">
                                    <label className="form-label">Prix (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={productForm.price}
                                        onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) })}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Image (Upload ou URL)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="file-input"
                                />
                                <div className="text-center my-2 text-xs text-gray-500">- OU -</div>
                                <input
                                    type="text"
                                    value={productForm.imagePath || ''}
                                    onChange={(e) => setProductForm({ ...productForm, imagePath: e.target.value })}
                                    className="form-input"
                                    placeholder="URL de l'image (ex: https://...)"
                                />
                                {productForm.imagePath && (
                                    <div className="image-preview">
                                        <img src={productForm.imagePath} alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Stock</label>
                                    <input
                                        type="number"
                                        value={productForm.stockQuantity}
                                        onChange={(e) => setProductForm({ ...productForm, stockQuantity: parseInt(e.target.value) })}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Seuil d'alerte</label>
                                    <input
                                        type="number"
                                        value={productForm.alertThreshold}
                                        onChange={(e) => setProductForm({ ...productForm, alertThreshold: parseInt(e.target.value) })}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={productForm.printTicket ?? true}
                                    onChange={(e) => setProductForm({ ...productForm, printTicket: e.target.checked })}
                                />
                                <div className="form-checkbox__label">
                                    <span className="form-checkbox__title">Imprimer ticket cuisine</span>
                                    <span className="form-checkbox__desc">Le produit sortira sur l'imprimante thermique</span>
                                </div>
                            </label>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="modal-btn modal-btn--secondary"
                                    disabled={isSaving}
                                >
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    className="modal-btn modal-btn--primary"
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
