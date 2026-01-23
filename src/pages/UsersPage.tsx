import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore, useSyncStore } from '../stores';
// removed direct api imports
import { Button, PlusIcon, EditIcon, TrashIcon, UserIcon, CheckIcon, XIcon, SearchIcon, ArrowLeftIcon } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { User, UserRole } from '../types';
import { ask } from '@tauri-apps/plugin-dialog';
import './UsersPage.css';

export const UsersPage: React.FC = () => {
    const navigate = useNavigate();
    // Use store instead of local state
    const { availableUsers, addUser, updateUser, deleteUser } = useAuthStore();
    const { pullUpdates } = useSyncStore();

    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        pin: '',
        role: 'cashier' as UserRole,
        isActive: true
    });

    // Initial load / Sync
    useEffect(() => {
        setIsLoading(true);
        pullUpdates().finally(() => setIsLoading(false));
    }, [pullUpdates]);

    const handleBack = () => navigate('/admin/dashboard');

    const handleOpenModal = (user: User | null = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                name: user.name,
                pin: '', // Don't show PIN for security
                role: user.role,
                isActive: user.isActive
            });
        } else {
            setEditingUser(null);
            setFormData({
                name: '',
                pin: '',
                role: 'cashier',
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                updateUser(editingUser.id!, {
                    name: formData.name,
                    pin: formData.pin || undefined,
                    role: formData.role,
                    isActive: formData.isActive
                });
            } else {
                if (!formData.pin) {
                    alert('Le code PIN est obligatoire pour un nouvel utilisateur');
                    return;
                }
                addUser({
                    name: formData.name,
                    pin: formData.pin,
                    role: formData.role
                });
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save user:', err);
            alert('Erreur lors de l\'enregistrement');
        }
    };

    const handleDelete = async (id: number) => {
        const confirmed = await ask('Êtes-vous sûr de vouloir supprimer cet utilisateur ?', {
            title: 'Confirmation de suppression',
            kind: 'warning',
            okLabel: 'Oui, supprimer',
            cancelLabel: 'Non, annuler'
        });

        if (!confirmed) return;

        try {
            deleteUser(id);
        } catch (err) {
            console.error('Failed to delete user:', err);
            alert('Erreur lors de la suppression');
        }
    };

    const filteredUsers = availableUsers.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) && u.isActive !== false
    );

    return (
        <div className="users-page">
            <header className="users-header">
                <Button variant="ghost" onClick={handleBack} className="users-back-btn">
                    <ArrowLeftIcon size={20} />
                    <span>Retour</span>
                </Button>
                <div className="users-header-info">
                    <h1>Gestion des Utilisateurs</h1>
                    <p>{filteredUsers.length} comptes configurés</p>
                </div>
                <Button variant="primary" onClick={() => handleOpenModal()} className="users-add-btn">
                    <PlusIcon size={20} />
                    Nouveau profil
                </Button>
            </header>

            <div className="users-toolbar">
                <div className="users-search">
                    <SearchIcon size={20} />
                    <input
                        type="text"
                        placeholder="Rechercher un utilisateur..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="users-list">
                {filteredUsers.length === 0 ? (
                    <div className="users-empty">
                        {isLoading ? 'Chargement...' : 'Aucun utilisateur trouvé'}
                    </div>
                ) : (
                    <div className="users-grid">
                        {filteredUsers.map(user => (
                            <div key={user.id} className={`user-item ${!user.isActive ? 'user-item--inactive' : ''}`}>
                                <div className="user-avatar">
                                    <UserIcon size={32} />
                                </div>
                                <div className="user-info">
                                    <h3>{user.name}</h3>
                                    <span className={`user-role badge-${user.role}`}>
                                        {user.role === 'admin' ? 'Administrateur' : user.role === 'manager' ? 'Gérant' : 'Vendeur'}
                                    </span>
                                </div>
                                <div className="user-status">
                                    {user.isActive ? (
                                        <span className="status-active"><CheckIcon size={16} /> Actif</span>
                                    ) : (
                                        <span className="status-inactive"><XIcon size={16} /> Inactif</span>
                                    )}
                                </div>
                                <div className="user-actions">
                                    <button onClick={() => handleOpenModal(user)} title="Modifier">
                                        <EditIcon size={20} />
                                    </button>
                                    <button onClick={() => handleDelete(user.id!)} className="delete" title="Supprimer">
                                        <TrashIcon size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Nom</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="Ex: Jean Dupont"
                                />
                            </div>
                            <div className="form-group">
                                <label>Code PIN {editingUser && '(Laisser vide pour ne pas changer)'}</label>
                                <input
                                    type="password"
                                    maxLength={4}
                                    value={formData.pin}
                                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                                    placeholder="4 chiffres"
                                    required={!editingUser}
                                />
                            </div>
                            <div className="form-group">
                                <label>Rôle</label>
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                                >
                                    <option value="cashier">Vendeur</option>
                                    <option value="manager">Gérant</option>
                                    <option value="admin">Administrateur</option>
                                </select>
                            </div>
                            {editingUser && (
                                <div className="form-group checkbox">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                        />
                                        Compte actif
                                    </label>
                                </div>
                            )}
                            <div className="form-actions">
                                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button>
                                <Button type="submit" variant="primary">Enregistrer</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
