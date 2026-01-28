import React, { useState } from 'react';
import { useProductStore } from '../stores';
import { PlusIcon, EditIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '../components/ui';
import type { Category, CategoryCreateInput } from '../types';
import { ask } from '@tauri-apps/plugin-dialog';
import './CategoriesPage.css';

// Color palette
const CATEGORY_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
    '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'
];

export const CategoriesPage: React.FC = () => {
    const { categories, addCategory, updateCategory, deleteCategory, reorderCategory } = useProductStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formData, setFormData] = useState<CategoryCreateInput>({
        name: '',
        color: CATEGORY_COLORS[0],
        icon: '',
        sortOrder: 0,
        isActive: true
    });

    const handleOpenModal = (category?: Category) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                name: category.name,
                color: category.color,
                icon: category.icon,
                sortOrder: category.sortOrder,
                isActive: category.isActive
            });
        } else {
            setEditingCategory(null);
            setFormData({
                name: '',
                color: CATEGORY_COLORS[0],
                icon: '',
                sortOrder: categories.length + 1,
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingCategory) {
            updateCategory(editingCategory.id, formData);
        } else {
            addCategory(formData);
        }
        setIsModalOpen(false);
    };

    const handleDelete = async (id: number) => {
        const confirmed = await ask('Êtes-vous sûr de vouloir supprimer cette famille ?', {
            title: 'Confirmer la suppression',
            kind: 'warning',
            okLabel: 'Oui, supprimer',
            cancelLabel: 'Non, annuler'
        });
        if (confirmed) {
            deleteCategory(id);
        }
    };

    return (
        <div className="categories-page">
            <div className="categories-header">
                <div className="categories-title">
                    <h1>Familles de Produits</h1>
                    <p>{categories.length} famille{categories.length > 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="btn-primary"
                >
                    <PlusIcon size={20} />
                    Nouveau
                </button>
            </div>

            <div className="categories-grid">
                {categories.map((category) => (
                    <div key={category.id} className={`category-card ${!category.isActive ? 'category-card--inactive' : ''}`}>
                        <div className="category-card__stripe" style={{ backgroundColor: category.color }}></div>
                        <div className="category-card__content">
                            <div className="category-card__header">
                                <div className="category-card__icon" style={{ color: category.color }}>
                                    {category.name.charAt(0)}
                                </div>
                                <div className="category-card__actions">
                                    <div className="category-card__reorder-group">
                                        <button
                                            onClick={() => reorderCategory(category.id, 'up')}
                                            className="category-card__action-btn category-card__action-btn--reorder"
                                            disabled={category.sortOrder <= 1} // Disable if first (or check index in logic)
                                            title="Monter"
                                        >
                                            <ArrowUpIcon size={16} />
                                        </button>
                                        <button
                                            onClick={() => reorderCategory(category.id, 'down')}
                                            className="category-card__action-btn category-card__action-btn--reorder"
                                            disabled={category.sortOrder >= categories.length} // Rough check, store logic handles bounds safely
                                            title="Descendre"
                                        >
                                            <ArrowDownIcon size={16} />
                                        </button>
                                    </div>
                                    <div className="category-card__divider"></div>
                                    <button
                                        onClick={() => handleOpenModal(category)}
                                        className="category-card__action-btn"
                                        title="Modifier"
                                    >
                                        <EditIcon size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(category.id)}
                                        className="category-card__action-btn category-card__action-btn--danger"
                                        title="Supprimer"
                                    >
                                        <TrashIcon size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="category-card__info">
                                <h3 className="category-card__name">{category.name}</h3>
                                <div className="category-card__badges">
                                    <span className="category-card__order">Ordre: {category.sortOrder}</span>
                                    <span className={`category-card__status ${category.isActive ? 'status--active' : 'status--inactive'}`}>
                                        {category.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {editingCategory ? 'Modifier la famille' : 'Nouvelle famille'}
                            </h2>
                        </div>

                        <form onSubmit={handleSave} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Nom</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="form-input"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Couleur</label>
                                <div className="color-grid">
                                    {CATEGORY_COLORS.map((color) => (
                                        <button
                                            type="button"
                                            key={color}
                                            onClick={() => setFormData({ ...formData, color })}
                                            className={`color-option ${formData.color === color ? 'color-option--selected' : ''}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Ordre d'affichage</label>
                                    <input
                                        type="number"
                                        value={formData.sortOrder}
                                        onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    />
                                    <div className="form-checkbox__label">
                                        <span className="form-checkbox__title">Catégorie active</span>
                                        <span className="form-checkbox__desc">Visible par le caissier sur la POS</span>
                                    </div>
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="modal-btn modal-btn--secondary"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="modal-btn modal-btn--primary"
                                >
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
