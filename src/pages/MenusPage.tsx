// ===================================
// MenusPage - Menu Management Interface (Harmonized)
// ===================================

import React, { useState, useMemo } from 'react';
import { useMenuStore, useProductStore } from '../stores';
import { PackageIcon, PlusIcon, EditIcon, TrashIcon, CheckIcon, XIcon, SearchIcon, HamburgerIcon } from '../components/ui';
import type { Menu, MenuCreateInput } from '../types';
import { getProductImageUrl } from '../helpers/urlHelper';
import { ask } from '@tauri-apps/plugin-dialog';
import './MenusPage.css';

export const MenusPage: React.FC = () => {
    const { menus, addMenu, updateMenu, deleteMenu, toggleMenuActive } = useMenuStore();
    const { categories, products, uploadProductImage } = useProductStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [menuForm, setMenuForm] = useState<MenuCreateInput>({
        name: '',
        description: '',
        price: 0,
        imagePath: '',
        components: [],
    });

    const filteredMenus = useMemo(() => {
        if (!searchQuery) return menus;
        const query = searchQuery.toLowerCase();
        return menus.filter(m => m.name.toLowerCase().includes(query));
    }, [menus, searchQuery]);

    const isPanelOpen = isCreating || editingMenu !== null;

    const handleOpenCreate = () => {
        setEditingMenu(null);
        setSelectedImageFile(null);
        setMenuForm({
            name: '',
            description: '',
            price: 0,
            imagePath: '',
            components: [],
        });
        setIsCreating(true);
    };

    const handleOpenEdit = (menu: Menu) => {
        setIsCreating(false);
        setSelectedImageFile(null);
        setEditingMenu(menu);
        setMenuForm({
            name: menu.name,
            description: menu.description || '',
            price: menu.price,
            imagePath: menu.imagePath || '',
            components: menu.components.map(comp => ({
                categoryId: comp.categoryId,
                label: comp.label,
                quantity: comp.quantity,
                isRequired: comp.isRequired,
                allowedProductIds: comp.allowedProductIds || [],
            })),
        });
    };

    const handleClosePanel = () => {
        setEditingMenu(null);
        setIsCreating(false);
        setSelectedImageFile(null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedImageFile(file);
            setMenuForm({ ...menuForm, imagePath: URL.createObjectURL(file) });
        }
    };

    const handleSave = async () => {
        if (!menuForm.name || menuForm.price <= 0) {
            alert('Veuillez remplir tous les champs obligatoires');
            return;
        }

        setIsSaving(true);
        try {
            let finalImagePath = menuForm.imagePath;

            if (selectedImageFile) {
                try {
                    finalImagePath = await uploadProductImage(selectedImageFile);
                } catch (error) {
                    console.error("Upload failed:", error);
                    alert("Échec de l'upload de l'image.");
                    finalImagePath = editingMenu?.imagePath || '';
                }
            } else {
                if (finalImagePath?.startsWith('blob:')) {
                    finalImagePath = editingMenu?.imagePath || '';
                }
            }

            const menuData = { ...menuForm, imagePath: finalImagePath };

            if (editingMenu) {
                updateMenu(editingMenu.id, menuData);
            } else {
                addMenu(menuData);
            }

            handleClosePanel();
        } catch (error) {
            console.error("Error saving menu:", error);
            alert("Erreur lors de l'enregistrement du menu");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        const confirmed = await ask('Êtes-vous sûr de vouloir supprimer ce menu ?', {
            title: 'Confirmer la suppression',
            kind: 'warning',
            okLabel: 'Oui, supprimer',
            cancelLabel: 'Non, annuler'
        });
        if (confirmed) {
            deleteMenu(id);
            if (editingMenu?.id === id) {
                handleClosePanel();
            }
        }
    };

    const addComponent = () => {
        setMenuForm({
            ...menuForm,
            components: [
                ...menuForm.components,
                {
                    categoryId: categories[0]?.id || 1,
                    label: '',
                    quantity: 1,
                    isRequired: true,
                    allowedProductIds: [],
                },
            ],
        });
    };

    const updateComponent = (index: number, updates: Partial<typeof menuForm.components[0]>) => {
        const newComponents = [...menuForm.components];
        newComponents[index] = { ...newComponents[index], ...updates };
        setMenuForm({ ...menuForm, components: newComponents });
    };

    const removeComponent = (index: number) => {
        setMenuForm({
            ...menuForm,
            components: menuForm.components.filter((_, i) => i !== index),
        });
    };

    const toggleProductInComponent = (componentIndex: number, productId: number) => {
        const component = menuForm.components[componentIndex];
        const isSelected = component.allowedProductIds.includes(productId);

        updateComponent(componentIndex, {
            allowedProductIds: isSelected
                ? component.allowedProductIds.filter(id => id !== productId)
                : [...component.allowedProductIds, productId],
        });
    };

    return (
        <div className={`menus-page ${isPanelOpen ? 'menus-page--panel-open' : ''}`}>
            {/* Main Content Area */}
            <div className="menus-main">
                {/* Header */}
                <div className="menus-header">
                    <div className="menus-title">
                        <h1>Gestion des Menus</h1>
                        <p>{filteredMenus.length} menu{filteredMenus.length > 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={handleOpenCreate} className="btn-primary">
                        <PlusIcon size={20} />
                        Nouveau
                    </button>
                </div>

                {/* Filters */}
                <div className="menus-filters">
                    <div className="search-wrapper">
                        <div className="search-icon">
                            <SearchIcon size={20} />
                        </div>
                        <input
                            type="text"
                            placeholder="Rechercher un menu..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>

                {/* Menus Grid */}
                <div className="menus-grid">
                    {filteredMenus.map((menu) => {
                        const isSelected = editingMenu?.id === menu.id;
                        return (
                            <div
                                key={menu.id}
                                className={`menu-card ${!menu.isActive ? 'menu-card--inactive' : ''} ${isSelected ? 'menu-card--selected' : ''}`}
                                onClick={() => handleOpenEdit(menu)}
                            >
                                {/* Image */}
                                <div className="menu-card__image-wrapper">
                                    {menu.imagePath ? (
                                        <img
                                            src={getProductImageUrl(menu.imagePath)}
                                            alt={menu.name}
                                            className="menu-card__image"
                                        />
                                    ) : (
                                        <div className="menu-card__image-placeholder">
                                            <HamburgerIcon size={36} />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="menu-card__info">
                                    <span className="menu-card__name">{menu.name}</span>
                                    <div className="menu-card__meta">
                                        <span className="menu-card__price">{menu.price.toFixed(2)} €</span>
                                        <span className="menu-card__components-count">
                                            {menu.components.length} composant{menu.components.length > 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="menu-card__actions">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleMenuActive(menu.id); }}
                                        className={`menu-card__toggle ${menu.isActive ? 'toggle--active' : ''}`}
                                        title={menu.isActive ? 'Désactiver' : 'Activer'}
                                    >
                                        {menu.isActive ? <CheckIcon size={14} /> : <XIcon size={14} />}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(menu.id); }}
                                        className="menu-card__delete"
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
            <div className={`menus-panel ${isPanelOpen ? 'menus-panel--open' : ''}`}>
                <div className="panel-header">
                    <h2>{editingMenu ? 'Modifier le menu' : 'Nouveau menu'}</h2>
                    <button onClick={handleClosePanel} className="panel-close">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="panel-content">
                    {/* Image Upload */}
                    <div className="panel-image-section">
                        <div className="panel-image-preview">
                            {menuForm.imagePath ? (
                                <img
                                    src={menuForm.imagePath.startsWith('blob:') ? menuForm.imagePath : getProductImageUrl(menuForm.imagePath)}
                                    alt="Preview"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : (
                                <HamburgerIcon size={48} />
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
                            <label className="form-label">Nom du menu *</label>
                            <input
                                type="text"
                                value={menuForm.name}
                                onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                                className="form-input"
                                placeholder="Ex: Menu XL"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                value={menuForm.description}
                                onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })}
                                className="form-input form-textarea"
                                placeholder="Description du menu..."
                                rows={2}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Prix (€) *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={menuForm.price}
                                onChange={(e) => setMenuForm({ ...menuForm, price: parseFloat(e.target.value) || 0 })}
                                className="form-input"
                            />
                        </div>

                        {/* Components Section */}
                        <div className="panel-section">
                            <div className="panel-section-header">
                                <span className="panel-section-title">Composants</span>
                                <button type="button" className="btn-sm btn-secondary" onClick={addComponent}>
                                    <PlusIcon size={14} />
                                    Ajouter
                                </button>
                            </div>

                            <div className="components-list">
                                {menuForm.components.map((component, index) => (
                                    <div key={index} className="component-editor">
                                        <div className="component-header">
                                            <input
                                                type="text"
                                                value={component.label}
                                                onChange={(e) => updateComponent(index, { label: e.target.value })}
                                                placeholder="Ex: Boisson"
                                                className="form-input component-label"
                                            />
                                            <button
                                                type="button"
                                                className="component-delete"
                                                onClick={() => removeComponent(index)}
                                            >
                                                <TrashIcon size={14} />
                                            </button>
                                        </div>

                                        <div className="component-controls">
                                            <select
                                                value={component.categoryId}
                                                onChange={(e) => updateComponent(index, { categoryId: parseInt(e.target.value) })}
                                                className="form-input"
                                            >
                                                {categories.map((cat) => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                min="1"
                                                value={component.quantity}
                                                onChange={(e) => updateComponent(index, { quantity: parseInt(e.target.value) })}
                                                className="form-input component-qty"
                                                title="Quantité"
                                            />
                                        </div>

                                        <div className="product-chips">
                                            {products
                                                .filter((p) => p.categoryId === component.categoryId && p.isActive)
                                                .map((product) => (
                                                    <label
                                                        key={product.id}
                                                        className={`product-chip ${component.allowedProductIds.includes(product.id) ? 'product-chip--selected' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={component.allowedProductIds.includes(product.id)}
                                                            onChange={() => toggleProductInComponent(index, product.id)}
                                                        />
                                                        {product.name}
                                                    </label>
                                                ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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

export default MenusPage;
