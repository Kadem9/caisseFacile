// ===================================
// MenusPage - Menu Management Interface
// ===================================

import React, { useState } from 'react';
import { useMenuStore, useProductStore } from '../stores';
import { PackageIcon, PlusIcon, EditIcon, TrashIcon, CheckIcon, XIcon } from '../components/ui';
import type { Menu, MenuCreateInput } from '../types';
import { getProductImageUrl } from '../helpers/urlHelper';
import './MenusPage.css';

export const MenusPage: React.FC = () => {
    const { menus, addMenu, updateMenu, deleteMenu, toggleMenuActive } = useMenuStore();
    const { categories, products, uploadProductImage } = useProductStore();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [menuForm, setMenuForm] = useState<MenuCreateInput>({
        name: '',
        description: '',
        price: 0,
        imagePath: '',
        components: [],
    });

    const handleOpenModal = (menu?: Menu) => {
        if (menu) {
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
        } else {
            setEditingMenu(null);
            setMenuForm({
                name: '',
                description: '',
                price: 0,
                imagePath: '',
                components: [],
            });
        }
        setSelectedImageFile(null);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!menuForm.name || menuForm.price <= 0) {
            alert('Veuillez remplir tous les champs obligatoires');
            return;
        }

        try {
            let finalImagePath = menuForm.imagePath;

            // Upload image if a new file was selected
            if (selectedImageFile) {
                console.log("Starting upload for:", selectedImageFile.name);
                try {
                    finalImagePath = await uploadProductImage(selectedImageFile);
                    console.log("Upload success, path:", finalImagePath);
                } catch (error) {
                    console.error("Upload failed details:", error);
                    alert("Échec de l'upload de l'image. Le menu sera enregistré sans nouvelle image.");
                    finalImagePath = editingMenu?.imagePath || '';
                }
            } else {
                // No new file selected, ensure we don't save a blob
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

            setIsModalOpen(false);
            setSelectedImageFile(null);
        } catch (error) {
            console.error("Error saving menu:", error);
            alert("Erreur lors de l'enregistrement du menu");
        }
    };

    const handleDelete = (id: number) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce menu ?')) {
            deleteMenu(id);
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
        <div className="menus-page">
            <div className="menus-header">
                <h1>Gestion des Menus</h1>
                <button className="btn-primary" onClick={() => handleOpenModal()}>
                    <PlusIcon size={18} />
                    Nouveau Menu
                </button>
            </div>

            <div className="menus-grid">
                {menus.map((menu) => (
                    <div key={menu.id} className={`menu-card ${!menu.isActive ? 'inactive' : ''}`}>
                        <div className="menu-card__image-container">
                            {menu.imagePath ? (
                                <img
                                    src={getProductImageUrl(menu.imagePath)}
                                    alt={menu.name}
                                    className="menu-card__image"
                                />
                            ) : (
                                <div className="menu-card__image-placeholder">
                                    <PackageIcon size={48} color="#ccc" />
                                </div>
                            )}
                        </div>

                        <div className="menu-card__content">
                            <h3>{menu.name}</h3>
                            {menu.description && <p className="menu-card__description">{menu.description}</p>}
                            <div className="menu-card__price">{menu.price.toFixed(2)} €</div>

                            <div className="menu-card__components">
                                {menu.components.map((comp, idx) => (
                                    <div key={idx} className="component-badge">
                                        {comp.label} ({comp.quantity})
                                    </div>
                                ))}
                            </div>

                            <div className="menu-card__actions">
                                <button
                                    className="btn-icon"
                                    onClick={() => toggleMenuActive(menu.id)}
                                    title={menu.isActive ? 'Désactiver' : 'Activer'}
                                >
                                    {menu.isActive ? <CheckIcon size={18} /> : <XIcon size={18} />}
                                </button>
                                <button
                                    className="btn-icon"
                                    onClick={() => handleOpenModal(menu)}
                                    title="Modifier"
                                >
                                    <EditIcon size={18} />
                                </button>
                                <button
                                    className="btn-icon btn-danger"
                                    onClick={() => handleDelete(menu.id)}
                                    title="Supprimer"
                                >
                                    <TrashIcon size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content menus-modal-large" onClick={(e) => e.stopPropagation()}>
                        <h2>{editingMenu ? 'Modifier le Menu' : 'Nouveau Menu'}</h2>

                        <div className="menus-modal-split">
                            <div className="menus-modal-info">
                                <div className="form-group">
                                    <label>Nom du menu *</label>
                                    <input
                                        type="text"
                                        value={menuForm.name}
                                        onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                                        placeholder="Ex: Menu XL"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={menuForm.description}
                                        onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })}
                                        placeholder="Description du menu..."
                                        rows={3}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Prix *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={menuForm.price}
                                        onChange={(e) => setMenuForm({ ...menuForm, price: parseFloat(e.target.value) })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Image du menu</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setSelectedImageFile(file);
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setMenuForm({ ...menuForm, imagePath: reader.result as string });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    {menuForm.imagePath && (
                                        <div className="image-preview">
                                            <img src={getProductImageUrl(menuForm.imagePath)} alt="Aperçu" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="menus-modal-components">
                                <div className="form-section">
                                    <div className="form-section-header">
                                        <h3>Composants du menu</h3>
                                        <button type="button" className="btn-secondary btn-sm" onClick={addComponent}>
                                            <PlusIcon size={14} />
                                            Ajouter un composant
                                        </button>
                                    </div>

                                    <div className="menu-components-scroll">
                                        {menuForm.components.map((component, index) => (
                                            <div key={index} className="component-editor">
                                                <div className="component-editor-header">
                                                    <input
                                                        type="text"
                                                        value={component.label}
                                                        onChange={(e) => updateComponent(index, { label: e.target.value })}
                                                        placeholder="Ex: Boisson"
                                                        className="component-label-input"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-icon btn-danger"
                                                        onClick={() => removeComponent(index)}
                                                    >
                                                        <TrashIcon size={16} />
                                                    </button>
                                                </div>

                                                <div className="component-editor-controls">
                                                    <div className="form-group-inline">
                                                        <label>Catégorie</label>
                                                        <select
                                                            value={component.categoryId}
                                                            onChange={(e) => updateComponent(index, { categoryId: parseInt(e.target.value) })}
                                                        >
                                                            {categories.map((cat) => (
                                                                <option key={cat.id} value={cat.id}>
                                                                    {cat.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="form-group-inline">
                                                        <label>Quantité</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={component.quantity}
                                                            onChange={(e) => updateComponent(index, { quantity: parseInt(e.target.value) })}
                                                        />
                                                    </div>

                                                    <div className="form-group-inline">
                                                        <label>
                                                            <input
                                                                type="checkbox"
                                                                checked={component.isRequired}
                                                                onChange={(e) => updateComponent(index, { isRequired: e.target.checked })}
                                                            />
                                                            Obligatoire
                                                        </label>
                                                    </div>
                                                </div>

                                                <div className="product-selection">
                                                    <label>Produits autorisés ({products.filter((p) => p.categoryId === component.categoryId && p.isActive).length} disponibles)</label>
                                                    <div className="product-selection-grid">
                                                        {products
                                                            .filter((p) => p.categoryId === component.categoryId && p.isActive)
                                                            .map((product) => (
                                                                <label key={product.id} className="product-checkbox">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={component.allowedProductIds.includes(product.id)}
                                                                        onChange={() => toggleProductInComponent(index, product.id)}
                                                                    />
                                                                    <span>{product.name}</span>
                                                                </label>
                                                            ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                                Annuler
                            </button>
                            <button type="button" className="btn-primary" onClick={handleSave}>
                                {editingMenu ? 'Modifier' : 'Créer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MenusPage;
