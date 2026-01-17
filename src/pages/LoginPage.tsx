// ===================================
// Login Page - User Selection & PIN Entry
// ===================================

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm } from '@tauri-apps/plugin-dialog';
import { UserCard } from '../components/auth';
import { NumPad, PinDisplay, PowerIcon, XIcon } from '../components/ui';
import { useAuthStore, useTransactionStore } from '../stores';
import { fetchUsers, getApiUrl } from '../services/api';
import { generateAndSaveDailyReport } from '../utils/autoBackup';
import type { User } from '../types';
import './LoginPage.css';
import logoImg from '../assets/logo-asmsp.png';

const PIN_LENGTH = 4;

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuthStore();
    const { transactions } = useTransactionStore();

    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [backupStatus, setBackupStatus] = useState<string | null>(null);

    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const apiUrl = getApiUrl();
            console.log(`[Login] Fetching users from: ${apiUrl}/api/users`);
            const result = await fetchUsers();
            console.log('[Login] Fetch result:', result);
            if (result.success) {
                const activeUsers = result.users.filter(u => u.isActive);
                setUsers(activeUsers);
                if (activeUsers.length === 0) {
                    setLoadError(`Aucun profil actif trouvé sur le serveur.`);
                }
            } else {
                setLoadError(`Le serveur a renvoyé une erreur.`);
            }
        } catch (err: any) {
            console.error('Failed to load users:', err);
            setLoadError(`Erreur de connexion au serveur (${getApiUrl()})`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const handleUserSelect = useCallback((user: User) => {
        setSelectedUser(user);
        setPin('');
        setIsError(false);
    }, []);

    const handleDigitPress = useCallback((digit: string) => {
        if (pin.length < PIN_LENGTH) {
            setPin((prev) => prev + digit);
            setIsError(false);
        }
    }, [pin.length]);

    const handleBackspace = useCallback(() => {
        setPin((prev) => prev.slice(0, -1));
        setIsError(false);
    }, []);

    const handleClear = useCallback(() => {
        setPin('');
        setIsError(false);
    }, []);

    const handleConfirm = useCallback(async () => {
        if (!selectedUser || pin.length !== PIN_LENGTH) return;

        setIsLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (pin === selectedUser.pinHash) {
            login(selectedUser);
            navigate('/pos');
        } else {
            setIsError(true);
            setPin('');
            setIsLoading(false);
        }
    }, [selectedUser, pin, login, navigate]);

    const handleBackToUsers = useCallback(() => {
        setSelectedUser(null);
        setPin('');
        setIsError(false);
    }, []);

    const performBackup = async () => {
        setBackupStatus("Sauvegarde en cours...");
        try {
            await generateAndSaveDailyReport(transactions);
            setBackupStatus("Sauvegarde réussie !");
            return true;
        } catch (error) {
            console.error("Backup failed", error);
            setBackupStatus("Erreur sauvegarde.");
            // We proceed even if backup fails, but maybe log it?
            return false;
        }
    };

    const handleCloseApp = useCallback(async () => {
        // No confirmation needed for simple close? Or maybe yes?
        // User asked confirmation specifically for Shutdown.
        // Let's keep close simple or maybe a small confirm via browser api or tauri
        const confirmed = await confirm('Voulez-vous fermer l\'application ?', { title: 'Fermer', kind: 'info' });
        if (!confirmed) return;

        await performBackup();
        await getCurrentWindow().close();
    }, [transactions]);

    const handleShutdown = useCallback(async () => {
        const confirmed = await confirm(
            'Voulez-vous vraiment éteindre la caisse et l\'ordinateur ?',
            { title: 'Fermeture de la caisse', kind: 'warning' }
        );

        if (confirmed) {
            await performBackup();
            try {
                await invoke('shutdown_system');
            } catch (error) {
                console.error('Failed to shutdown:', error);
                alert('Erreur lors de l\'arrêt du système: ' + error);
            }
        }
    }, [transactions]);

    // Quick close without backup or confirmation
    const handleQuickClose = useCallback(async () => {
        await invoke('quit_app');
    }, []);

    return (
        <div className="login-page">
            {/* Left Brand Panel */}
            <aside className="login-page__brand-panel">
                <div className="login-page__logo-wrapper">
                    <img
                        src={logoImg}
                        alt="Logo AS Manissieux"
                        className="login-page__logo-img"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                </div>
                <div className="login-page__title-group">
                    <h1 className="login-page__title">AS Manissieux</h1>
                    <p className="login-page__subtitle">Caisse Buvette</p>
                </div>
            </aside>

            {/* Right Content Panel */}
            <div className="login-page__content-panel">
                {/* Quick Close Button */}
                <button
                    className="login-page__quick-close"
                    onClick={handleQuickClose}
                    type="button"
                    title="Fermer rapidement"
                >
                    <XIcon size={20} />
                </button>
                <main className="login-page__content">
                    {!selectedUser ? (
                        <section className="login-page__users">
                            <h2 className="login-page__section-title">
                                Qui êtes-vous ?
                            </h2>

                            {isLoading ? (
                                <div className="login-page__loading">Chargement...</div>
                            ) : loadError ? (
                                <div className="login-page__error-container">
                                    <p className="login-page__error-msg">{loadError}</p>
                                    <button onClick={loadUsers} className="login-page__retry-btn">
                                        Réessayer
                                    </button>
                                </div>
                            ) : (
                                <div className="login-page__user-grid">
                                    {users.map((user: User) => (
                                        <UserCard
                                            key={user.id}
                                            user={user}
                                            onSelect={handleUserSelect}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    ) : (
                        <section className="login-page__pin-entry">
                            <div className="login-page__pin-header">
                                <button
                                    className="login-page__back-btn"
                                    onClick={handleBackToUsers}
                                    type="button"
                                >
                                    ← Retour
                                </button>

                                <div className="login-page__selected-user">
                                    <h2>Bonjour, {selectedUser.name.split(' ')[0]} !</h2>
                                    <p className="login-page__instruction">
                                        Entrez votre code PIN
                                    </p>
                                </div>

                                <div className="login-page__pin-display-wrapper">
                                    <PinDisplay
                                        length={pin.length}
                                        maxLength={PIN_LENGTH}
                                        isError={isError}
                                    />
                                </div>

                                {isError && (
                                    <p className="login-page__error">
                                        Code PIN incorrect. Réessayez.
                                    </p>
                                )}
                            </div>

                            <div className="login-page__numpad-wrapper">
                                <NumPad
                                    onDigitPress={handleDigitPress}
                                    onBackspace={handleBackspace}
                                    onClear={handleClear}
                                    onConfirm={handleConfirm}
                                    showConfirm={pin.length === PIN_LENGTH}
                                    disabled={isLoading}
                                />
                            </div>
                        </section>
                    )}
                </main>

                <footer className="login-page__footer">
                    <div className="login-page__footer-content">
                        {backupStatus && (
                            <span className="backup-status-pill">{backupStatus}</span>
                        )}
                        <div className="login-page__actions-group">
                            <button
                                className="login-page__action-btn"
                                onClick={handleCloseApp}
                                type="button"
                                title="Fermer la caisse (Application)"
                            >
                                <XIcon size={18} />
                                <span>Fermer l'app</span>
                            </button>
                            <button
                                className="login-page__action-btn login-page__action-btn--danger"
                                onClick={handleShutdown}
                                type="button"
                                title="Éteindre l'ordinateur"
                            >
                                <PowerIcon size={18} />
                                <span>Éteindre</span>
                            </button>
                        </div>
                    </div>
                    <p className="login-page__copyright">CaisseFacile © 2026</p>
                </footer>
            </div>
        </div>
    );
};


export default LoginPage;
