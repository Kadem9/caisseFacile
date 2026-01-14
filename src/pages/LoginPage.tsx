// ===================================
// Login Page - User Selection & PIN Entry
// ===================================

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCard } from '../components/auth';
import { NumPad, PinDisplay } from '../components/ui';
import { useAuthStore } from '../stores';
import type { User } from '../types';
import './LoginPage.css';
import logoImg from '../assets/logo-asmsp.png';

// Temporary mock users for development
const MOCK_USERS: User[] = [
    {
        id: 1,
        name: 'Kadem',
        pinHash: '1999',
        role: 'admin',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 2,
        name: 'Marie Agnes',
        pinHash: '2802',
        role: 'cashier',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 3,
        name: 'ASMSP',
        pinHash: '5273',
        role: 'cashier',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

const PIN_LENGTH = 4;

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuthStore();

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

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

        // Simulate async validation
        await new Promise((resolve) => setTimeout(resolve, 300));

        // In production, this would validate against a hashed PIN
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

    return (
        <div className="login-page">
            <div className="login-page__container">
                {/* Header */}
                <header className="login-page__header">
                    <div className="login-page__brand">
                        <div className="login-page__logo-wrapper">
                            <img
                                src={logoImg}
                                alt="Logo"
                                className="login-page__logo-img"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.querySelector('.login-page__logo-fallback')!.removeAttribute('hidden');
                                }}
                            />
                            <span className="login-page__logo-fallback" hidden>⚽</span>
                        </div>
                        <div className="login-page__title-group">
                            <h1 className="login-page__title">
                                AS Manissieux
                            </h1>
                            <p className="login-page__subtitle">Caisse Buvette</p>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="login-page__content">
                    {!selectedUser ? (
                        // Step 1: User Selection
                        <section className="login-page__users">
                            <h2 className="login-page__section-title">Choisissez votre profil</h2>
                            <div className="login-page__user-grid">
                                {MOCK_USERS.map((user) => (
                                    <UserCard
                                        key={user.id}
                                        user={user}
                                        onSelect={handleUserSelect}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : (
                        // Step 2: PIN Entry
                        <section className="login-page__pin-entry">
                            <div className="login-page__pin-left">
                                <button
                                    className="login-page__back-btn"
                                    onClick={handleBackToUsers}
                                    type="button"
                                    style={{ position: 'static', alignSelf: 'flex-start', marginBottom: 'auto' }}
                                >
                                    ← Retour
                                </button>

                                <div className="login-page__pin-header">
                                    <div className="login-page__selected-user">
                                        <h2>Bonjour, {selectedUser.name.split(' ')[0]} !</h2>
                                        <p className="login-page__instruction">
                                            Entrez votre code PIN
                                        </p>
                                    </div>

                                    <div style={{ marginTop: '2rem' }}>
                                        <PinDisplay
                                            length={pin.length}
                                            maxLength={PIN_LENGTH}
                                            isError={isError}
                                        />
                                    </div>

                                    {isError && (
                                        <p className="login-page__error" style={{ marginTop: '1rem' }}>
                                            Code PIN incorrect. Réessayez.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="login-page__pin-right">
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

                {/* Footer */}
                <footer className="login-page__footer">
                    <p>CaisseFacile développé par Kadem. Tous droits réservés. © 2026</p>
                </footer>
            </div>
        </div>
    );
};

export default LoginPage;
