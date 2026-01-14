import React, { useState } from 'react';
import { useProductStore } from '../stores';
import { PlusIcon, EditIcon, TrashIcon } from '../components/ui';
import type { Category, CategoryCreateInput } from '../types';
import './CategoriesPage.css';

// Color palette
const CATEGORY_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
    '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'
];

export const CategoriesPage: React.FC = () => {
    const { categories, addCategory, updateCategory, deleteCategory } = useProductStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formData, setFormData] = useState<CategoryCreateInput>({
        name: '',
        color: CATEGORY_COLORS[0],
        icon: '',
        sortOrder: 0
    });

    const handleOpenModal = (category?: Category) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                name: category.name,
                color: category.color,
                icon: category.icon,
                sortOrder: category.sortOrder
            });
        } else {
            setEditingCategory(null);
            setFormData({
                name: '',
                color: CATEGORY_COLORS[0],
                icon: '',
                sortOrder: categories.length + 1
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

    const handleDelete = (id: number) => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer cette famille ?')) {
            deleteCategory(id);
        }
    };

    return (
        <div className="categories-page">
            <div className="categories-header">
                <div className="categories-title">
                    <h1>Familles de Produits</h1>
                    <p>Gérez les catégories de votre carte</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="category-card__action-btn category-card__action-btn--primary"
                    style={{ background: '#6366f1', color: 'white', padding: '0.75rem 1rem', gap: '0.5rem' }}
                >
                    <PlusIcon size={20} />
                    Nouvelle Famille
                </button>
            </div>

            <div className="categories-grid">
                {categories.map((category) => (
                    <div key={category.id} className="category-card">
                        <div className="category-card__stripe" style={{ backgroundColor: category.color }}></div>
                        <div className="category-card__content">
                            <div className="category-card__header">
                                <div className="category-card__icon" style={{ color: category.color }}>
                                    {category.name.charAt(0)}
                                </div>
                                <div className="category-card__actions">
                                    <button
                                        onClick={() => handleOpenModal(category)}
                                        className="category-card__action-btn"
                                    >
                                        <EditIcon size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(category.id)}
                                        className="category-card__action-btn category-card__action-btn--danger"
                                    >
                                        <TrashIcon size={18} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="category-card__name">{category.name}</h3>
                            <span className="category-card__order">Ordre d'affichage: {category.sortOrder}</span>
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

                            <div className="form-group">
                                <label className="form-label">Ordre d'affichage</label>
                                <input
                                    type="number"
                                    value={formData.sortOrder}
                                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                                    className="form-input"
                                />
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
