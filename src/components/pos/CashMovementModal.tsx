import React, { useState, useEffect, useCallback } from 'react';
import { Button, XIcon, EuroIcon, VirtualNumpad } from '../ui';
import './CashModals.css';

interface CashMovementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { type: 'withdrawal' | 'deposit'; amount: number; reason: string }) => void;
    defaultType?: 'withdrawal' | 'deposit';
}

const REASONS = [
    'Surplus de caisse',
    'Paiement fournisseur',
    'Erreur de caisse',
    'Appoint fond de caisse'
];

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    defaultType = 'withdrawal'
}) => {
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [type, setType] = useState<'withdrawal' | 'deposit'>(defaultType);

    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setReason('');
            setCustomReason('');
            setType(defaultType);
        }
    }, [isOpen, defaultType]);

    const handleDigit = useCallback((digit: string) => {
        setAmount(prev => {
            if (digit === ',') {
                if (prev.includes(',')) return prev;
                if (!prev) return '0,';
                return prev + ',';
            }
            if (prev.includes(',')) {
                const parts = prev.split(',');
                if (parts[1] && parts[1].length >= 2) return prev;
            }
            return prev + digit;
        });
    }, []);

    const handleBackspace = useCallback(() => {
        setAmount(prev => prev.slice(0, -1));
    }, []);

    const handleClear = useCallback(() => {
        setAmount('');
    }, []);

    const handleConfirm = () => {
        const numAmount = parseFloat(amount.replace(',', '.'));
        if (isNaN(numAmount) || numAmount <= 0) return;

        const finalReason = reason === 'Autre' ? customReason : reason;
        if (!finalReason) return;

        onConfirm({
            type,
            amount: numAmount,
            reason: finalReason
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content cash-modal">
                <header className="modal-header">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2>{type === 'withdrawal' ? 'Sortie de Caisse' : 'Entrée de Caisse'}</h2>
                        <span className="modal-subtitle">Saisissez le montant et la raison</span>
                    </div>
                    <button onClick={onClose} className="close-btn"><XIcon size={24} /></button>
                </header>

                <div className="modal-body cash-modal-body">

                    {/* Left Column: Form & Numpad */}
                    <div className="cash-modal-column cash-modal-column--left">
                        <div className="form-group amount-group">
                            <label>Montant</label>
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    value={amount}
                                    onChange={() => { }} // Controlled by Numpad
                                    placeholder="0,00"
                                    readOnly // Virtual Keyboard only
                                    className={!amount ? 'placeholder-shown' : ''}
                                />
                                <EuroIcon size={20} className="input-icon" />
                            </div>

                            <VirtualNumpad
                                onDigit={handleDigit}
                                onBackspace={handleBackspace}
                                onClear={handleClear}
                            />
                        </div>
                    </div>

                    {/* Right Column: Type & Reason */}
                    <div className="cash-modal-column cash-modal-column--right">
                        <div className="form-group">
                            <label>Type de mouvement</label>
                            <div className="type-toggle">
                                <button
                                    className={`type-btn ${type === 'withdrawal' ? 'active withdrawal' : ''}`}
                                    onClick={() => setType('withdrawal')}
                                >
                                    Retrait (-)
                                </button>
                                <button
                                    className={`type-btn ${type === 'deposit' ? 'active deposit' : ''}`}
                                    onClick={() => setType('deposit')}
                                >
                                    Dépôt (+)
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Raison</label>
                            <div className="reasons-grid">
                                {REASONS.map(r => (
                                    <button
                                        key={r}
                                        className={`reason-btn ${reason === r ? 'active' : ''}`}
                                        onClick={() => setReason(r)}
                                    >
                                        {r}
                                    </button>
                                ))}
                                <button
                                    className={`reason-btn ${reason === 'Autre' ? 'active' : ''}`}
                                    onClick={() => setReason('Autre')}
                                >
                                    Autre
                                </button>
                            </div>

                            {reason === 'Autre' && (
                                <div className="custom-reason-wrapper">
                                    <input
                                        type="text"
                                        className="custom-reason-input"
                                        placeholder="Précisez la raison..."
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="modal-footer">
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button
                        variant={type === 'withdrawal' ? 'danger' : 'primary'}
                        onClick={handleConfirm}
                        disabled={!amount || !reason || (reason === 'Autre' && !customReason)}
                        size="lg"
                    >
                        Valider
                    </Button>
                </footer>
            </div>
        </div>
    );
};
