// ===================================
// Payment Modal Component
// ===================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, CashIcon, CardIcon, ArrowLeftIcon, XIcon, CheckIcon, DrawerIcon, RefreshIcon, AlertIcon } from '../ui';
import { TicketsModal } from './TicketsModal';
import type { PaymentMethod, CartItem } from '../../types';
import './PaymentModal.css';

interface PaymentModalProps {
    isOpen: boolean;
    totalAmount: number;
    cartItems: CartItem[];
    onConfirm: (paymentInfo: PaymentResult) => void;
    onCancel: () => void;
    sellerName?: string;
}

export interface PaymentResult {
    method: PaymentMethod;
    totalAmount: number;
    cashReceived: number;
    cardAmount: number;
    changeGiven: number;
}

type PaymentStep = 'method' | 'cash' | 'card' | 'mixed' | 'complete';
type TpeStatus = 'idle' | 'connecting' | 'waiting' | 'success' | 'error';

interface TpeDeviceConfig {
    name: string;
    port: string;
    baudRate: number;
    posNumber: string;
}

interface TpeConfig {
    devices: [TpeDeviceConfig, TpeDeviceConfig];
    activeDeviceIndex: 0 | 1;
}

const QUICK_AMOUNTS = [5, 10, 20, 50];

const DENOMINATIONS = [
    { value: 50, type: 'banknote', label: '50€' },
    { value: 20, type: 'banknote', label: '20€' },
    { value: 10, type: 'banknote', label: '10€' },
    { value: 5, type: 'banknote', label: '5€' },
    { value: 2, type: 'coin', label: '2€' },
    { value: 1, type: 'coin', label: '1€' },
    { value: 0.5, type: 'coin', label: '50c' },
    { value: 0.2, type: 'coin', label: '20c' },
    { value: 0.1, type: 'coin', label: '10c' },
    { value: 0.05, type: 'coin', label: '5c' },
    { value: 0.02, type: 'coin', label: '2c' },
    { value: 0.01, type: 'coin', label: '1c' },
];

export const PaymentModal: React.FC<PaymentModalProps> = ({
    isOpen,
    totalAmount,
    cartItems,
    onConfirm,
    onCancel,
    sellerName,
}) => {
    const [step, setStep] = useState<PaymentStep>('method');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [cashInput, setCashInput] = useState('');
    const [cardAmount, setCardAmount] = useState(0);
    const [showTickets, setShowTickets] = useState(false);

    // TPE State
    const [tpeStatus, setTpeStatus] = useState<TpeStatus>('idle');
    const [tpeMessage, setTpeMessage] = useState<string>('');

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('method');
            setMethod('cash');
            setCashInput('');
            setCardAmount(0);
            setShowTickets(false);
            setTpeStatus('idle');
            setTpeMessage('');
        }
    }, [isOpen]);


    // Calculate cash received from input
    const cashReceived = useMemo(() => {
        const value = parseFloat(cashInput.replace(',', '.'));
        return isNaN(value) ? 0 : value;
    }, [cashInput]);

    // Calculate change
    const changeGiven = useMemo(() => {
        if (method === 'card') return 0;
        if (method === 'mixed') {
            return Math.max(0, cashReceived - (totalAmount - cardAmount));
        }
        return Math.max(0, cashReceived - totalAmount);
    }, [cashReceived, totalAmount, method, cardAmount]);

    // Check if payment is valid
    const isPaymentValid = useMemo(() => {
        if (method === 'cash') {
            return cashReceived >= totalAmount;
        }
        if (method === 'card') {
            return true; // Card payment is always valid
        }
        if (method === 'mixed') {
            return cashReceived + cardAmount >= totalAmount;
        }
        return false;
    }, [method, cashReceived, cardAmount, totalAmount]);

    // Calculate change breakdown
    const changeBreakdown = useMemo(() => {
        if (!isPaymentValid || changeGiven <= 0) return [];

        let remaining = Math.round(changeGiven * 100);
        const breakdown: { label: string; count: number; type: string; value: number }[] = [];

        for (const denom of DENOMINATIONS) {
            const denomInCents = Math.round(denom.value * 100);
            const count = Math.floor(remaining / denomInCents);
            if (count > 0) {
                breakdown.push({ ...denom, count });
                remaining %= denomInCents;
            }
        }
        return breakdown;
    }, [changeGiven, isPaymentValid]);

    // Send payment to TPE
    const sendToTpe = useCallback(async (amountCents: number) => {
        setTpeStatus('connecting');
        setTpeMessage('Connexion au TPE...');

        try {
            // Load TPE config from localStorage
            const savedConfig = localStorage.getItem('ma-caisse-tpe-config');
            if (!savedConfig) {
                setTpeStatus('error');
                setTpeMessage('Aucun TPE configuré. Allez dans Paramètres > TPE.');
                return false;
            }

            const config: TpeConfig = JSON.parse(savedConfig);
            const activeTpe = config.devices[config.activeDeviceIndex];

            if (!activeTpe.port) {
                setTpeStatus('error');
                setTpeMessage(`TPE "${activeTpe.name}" non configuré (port manquant).`);
                return false;
            }

            setTpeStatus('waiting');
            setTpeMessage(`Attente du paiement sur ${activeTpe.name}...`);

            // Send payment to TPE
            const result = await invoke<{ success: boolean; transaction_result: string; error_message?: string }>('send_tpe_payment', {
                portName: activeTpe.port,
                baudRate: activeTpe.baudRate,
                posNumber: activeTpe.posNumber,
                amountCents,
            });

            if (result.success) {
                setTpeStatus('success');
                setTpeMessage('Paiement accepté !');

                // Auto-confirm after success (like cash flow)
                setTimeout(() => {
                    const paymentResult: PaymentResult = {
                        method: 'card',
                        totalAmount: amountCents / 100,
                        cashReceived: 0,
                        cardAmount: amountCents / 100,
                        changeGiven: 0,
                    };
                    setStep('complete');
                    // Call onConfirm after showing complete step briefly
                    setTimeout(() => {
                        onConfirm(paymentResult);
                        // Don't reset here - useEffect will handle it when modal closes
                    }, 1500);
                }, 500);

                return true;
            } else {
                setTpeStatus('error');
                setTpeMessage(result.error_message || 'Paiement refusé');
                return false;
            }
        } catch (err) {
            setTpeStatus('error');
            setTpeMessage(String(err));
            return false;
        }
    }, [onConfirm, totalAmount]);

    const handleMethodSelect = useCallback((selectedMethod: PaymentMethod) => {
        setMethod(selectedMethod);
        setCashInput('');
        setCardAmount(0);
        setTpeStatus('idle');
        setTpeMessage('');

        if (selectedMethod === 'card') {
            setStep('card');
            // Don't auto-send - let user click the button to avoid crashes
        } else if (selectedMethod === 'mixed') {
            setStep('mixed');
        } else {
            setStep('cash');
        }
    }, []);


    const handleDigitPress = useCallback((digit: string) => {
        setCashInput((prev) => {
            // Limit to 2 decimal places
            if (prev.includes(',') || prev.includes('.')) {
                const [, decimal] = prev.split(/[,\.]/);
                if (decimal && decimal.length >= 2) return prev;
            }
            return prev + digit;
        });
    }, []);

    const handleDecimalPress = useCallback(() => {
        if (!cashInput.includes(',') && !cashInput.includes('.')) {
            setCashInput((prev) => (prev || '0') + ',');
        }
    }, [cashInput]);

    const handleBackspace = useCallback(() => {
        setCashInput((prev) => prev.slice(0, -1));
    }, []);

    const handleClear = useCallback(() => {
        setCashInput('');
    }, []);

    const handleQuickAmount = useCallback((amount: number) => {
        setCashInput(amount.toString().replace('.', ','));
    }, []);

    const handleExactAmount = useCallback(() => {
        setCashInput(totalAmount.toFixed(2).replace('.', ','));
    }, [totalAmount]);

    const handleConfirmPayment = useCallback(() => {
        const result: PaymentResult = {
            method,
            totalAmount,
            cashReceived: method === 'card' ? 0 : cashReceived,
            cardAmount: method === 'cash' ? 0 : method === 'card' ? totalAmount : cardAmount,
            changeGiven,
        };

        setStep('complete');

        // Show success briefly, then confirm
        setTimeout(() => {
            onConfirm(result);
            // Don't reset state here - useEffect will handle it when modal closes
        }, 1500);
    }, [method, totalAmount, cashReceived, cardAmount, changeGiven, onConfirm]);

    const handleBack = useCallback(() => {
        setStep('method');
        setCashInput('');
        setCardAmount(0);
    }, []);

    const handleClose = useCallback(() => {
        setStep('method');
        setCashInput('');
        setCardAmount(0);
        onCancel();
    }, [onCancel]);

    const formatPrice = (price: number): string => {
        return price.toFixed(2).replace('.', ',') + ' €';
    };

    if (!isOpen) return null;

    return (
        <div className="payment-modal__overlay" onClick={handleClose}>
            <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <header className="payment-modal__header">
                    <h2>Encaissement</h2>
                    <button className="payment-modal__close" onClick={handleClose} type="button">
                        <XIcon size={24} />
                    </button>
                </header>

                {/* Total Display */}
                <div className="payment-modal__total">
                    <span>Total à payer</span>
                    <span className="payment-modal__total-amount">{formatPrice(totalAmount)}</span>
                </div>

                {/* Content based on step */}
                <div className="payment-modal__content">
                    {step === 'method' && (
                        <div className="payment-modal__methods">
                            <h3>Mode de paiement</h3>
                            <div className="payment-modal__method-grid">
                                <button
                                    className="payment-modal__method-btn payment-modal__method-btn--cash"
                                    onClick={() => handleMethodSelect('cash')}
                                    type="button"
                                >
                                    <CashIcon size={48} />
                                    <span>Espèces</span>
                                </button>
                                <button
                                    className="payment-modal__method-btn payment-modal__method-btn--card"
                                    onClick={() => handleMethodSelect('card')}
                                    type="button"
                                >
                                    <CardIcon size={48} />
                                    <span>Carte</span>
                                </button>
                                <button
                                    className="payment-modal__method-btn payment-modal__method-btn--mixed"
                                    onClick={() => handleMethodSelect('mixed')}
                                    type="button"
                                >
                                    <div className="payment-modal__method-icon-complex">
                                        <CashIcon size={32} />
                                        <CardIcon size={32} />
                                    </div>
                                    <span>Mixte</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'cash' && (
                        <div className="payment-modal__cash payment-modal__cash--horizontal">
                            <div className="payment-modal__column">
                                <button className="payment-modal__back-btn" onClick={handleBack} type="button">
                                    <ArrowLeftIcon size={18} /> Retour
                                </button>

                                <h3><CashIcon size={24} /> Paiement en espèces</h3>
                                <p className="payment-modal__instruction">Combien le client vous a-t-il donné ?</p>

                                {/* Cash input display */}
                                <div className="payment-modal__cash-display">
                                    <span className="payment-modal__cash-label">Montant reçu</span>
                                    <span className="payment-modal__cash-value">
                                        {cashInput || '0'} €
                                    </span>
                                </div>

                                {/* Numpad */}
                                <div className="payment-modal__numpad">
                                    <div className="payment-modal__numpad-grid">
                                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((key) => (
                                            <button
                                                key={key}
                                                className="btn btn--numpad"
                                                onClick={() => {
                                                    if (key === '⌫') handleBackspace();
                                                    else if (key === ',') handleDecimalPress();
                                                    else handleDigitPress(key);
                                                }}
                                                type="button"
                                            >
                                                {key}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        className="btn btn--danger payment-modal__clear-btn"
                                        onClick={handleClear}
                                        type="button"
                                    >
                                        Effacer
                                    </button>
                                </div>
                            </div>

                            <div className="payment-modal__column">
                                {/* Banknote Selectors */}
                                <div className="payment-modal__banknotes">
                                    {QUICK_AMOUNTS.map((amount) => (
                                        <button
                                            key={amount}
                                            className={`btn-banknote btn-banknote--${amount}`}
                                            onClick={() => handleQuickAmount(amount)}
                                            type="button"
                                        >
                                            <div className="banknote-value">{amount}€</div>
                                            <div className="banknote-label">Billet</div>
                                        </button>
                                    ))}
                                    <button
                                        className="btn-banknote btn-banknote--exact"
                                        onClick={handleExactAmount}
                                        type="button"
                                    >
                                        <div className="banknote-value">Fixe</div>
                                        <div className="banknote-label">Appoint</div>
                                    </button>
                                </div>

                                {/* Change display */}
                                {cashReceived > 0 && (
                                    <div className={`payment-modal__change ${isPaymentValid ? 'payment-modal__change--valid' : 'payment-modal__change--invalid'}`}>
                                        <div className="payment-modal__change-info">
                                            <span className="payment-modal__change-label">
                                                {isPaymentValid ? "À RENDRE AU CLIENT" : "MONTANT MANQUANT"}
                                            </span>
                                            <span className="payment-modal__change-amount">
                                                {isPaymentValid ? formatPrice(changeGiven) : formatPrice(totalAmount - cashReceived)}
                                            </span>
                                        </div>
                                        {isPaymentValid && changeGiven > 0 && (
                                            <div className="payment-modal__change-helper text-success">
                                                Donnez {formatPrice(changeGiven)} de monnaie.
                                            </div>
                                        )}
                                        {isPaymentValid && changeBreakdown.length > 0 && (
                                            <div className="payment-modal__breakdown">
                                                {changeBreakdown.map((item, idx) => (
                                                    <div key={idx} className={`breakdown-item breakdown-item--${item.type}`}>
                                                        <span className="breakdown-count">{item.count}x</span>
                                                        <span className={`breakdown-icon breakdown-icon--${item.value.toString().replace('.', '-')}`}>
                                                            {item.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Confirm button */}
                                <div className="payment-modal__actions">
                                    <Button
                                        variant="secondary"
                                        size="xl"
                                        className="btn-drawer"
                                        onClick={() => console.log('Opening drawer...')}
                                        type="button"
                                    >
                                        <DrawerIcon size={20} /> Ouvrir le tiroir
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="xl"
                                        className="btn-confirm"
                                        onClick={handleConfirmPayment}
                                        disabled={!isPaymentValid}
                                    >
                                        <CheckIcon size={20} /> Valider le paiement
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'card' && (
                        <div className="payment-modal__card">
                            <button className="payment-modal__back-btn" onClick={handleBack} type="button">
                                <ArrowLeftIcon size={18} /> Retour
                            </button>

                            <h3><CardIcon size={24} /> Paiement par carte</h3>

                            <div className="payment-modal__card-info">
                                <div className="payment-modal__card-icon">
                                    {tpeStatus === 'connecting' || tpeStatus === 'waiting' ? (
                                        <RefreshIcon size={80} className="animate-spin" />
                                    ) : tpeStatus === 'success' ? (
                                        <CheckIcon size={80} color="#22c55e" />
                                    ) : tpeStatus === 'error' ? (
                                        <AlertIcon size={80} color="#ef4444" />
                                    ) : (
                                        <CardIcon size={80} />
                                    )}
                                </div>
                                <p>Montant à débiter</p>
                                <span className="payment-modal__card-amount">{formatPrice(totalAmount)}</span>

                                {/* TPE Status Message */}
                                <p className={`payment-modal__card-instruction ${tpeStatus === 'error' ? 'text-danger' : tpeStatus === 'success' ? 'text-success' : ''}`}>
                                    {tpeMessage || 'Présentez la carte au terminal'}
                                </p>
                            </div>

                            {/* Actions based on TPE status */}
                            {tpeStatus === 'idle' && (
                                <Button
                                    variant="primary"
                                    size="xl"
                                    isFullWidth
                                    onClick={() => sendToTpe(Math.round(totalAmount * 100))}
                                >
                                    <CardIcon size={18} /> Envoyer au TPE
                                </Button>
                            )}

                            {(tpeStatus === 'connecting' || tpeStatus === 'waiting') && (
                                <Button
                                    variant="secondary"
                                    size="xl"
                                    isFullWidth
                                    onClick={() => {
                                        setTpeStatus('idle');
                                        setTpeMessage('');
                                    }}
                                >
                                    <XIcon size={18} /> Annuler
                                </Button>
                            )}

                            {tpeStatus === 'success' && (
                                <Button
                                    variant="primary"
                                    size="xl"
                                    isFullWidth
                                    onClick={handleConfirmPayment}
                                >
                                    <CheckIcon size={18} /> Valider le paiement
                                </Button>
                            )}

                            {tpeStatus === 'error' && (
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <Button
                                        variant="secondary"
                                        size="xl"
                                        onClick={handleConfirmPayment}
                                        style={{ flex: 1 }}
                                    >
                                        <CheckIcon size={18} /> Valider manuellement
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="xl"
                                        onClick={() => sendToTpe(Math.round(totalAmount * 100))}
                                        style={{ flex: 1 }}
                                    >
                                        <RefreshIcon size={18} /> Réessayer
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'mixed' && (
                        <div className="payment-modal__mixed">
                            <button className="payment-modal__back-btn" onClick={handleBack} type="button">
                                <ArrowLeftIcon size={18} /> Retour
                            </button>

                            <h3>Paiement mixte</h3>

                            <div className="payment-modal__mixed-info">
                                <p>Entrez le montant en espèces, le reste sera débité par carte.</p>
                            </div>

                            {/* Cash input display */}
                            <div className="payment-modal__cash-display">
                                <span className="payment-modal__cash-label">Espèces reçues</span>
                                <span className="payment-modal__cash-value">
                                    {cashInput || '0'} €
                                </span>
                            </div>

                            {/* Numpad */}
                            <div className="payment-modal__numpad payment-modal__numpad--small">
                                <div className="payment-modal__numpad-grid">
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((key) => (
                                        <button
                                            key={key}
                                            className="btn btn--numpad"
                                            onClick={() => {
                                                if (key === '⌫') handleBackspace();
                                                else if (key === ',') handleDecimalPress();
                                                else handleDigitPress(key);
                                            }}
                                            type="button"
                                        >
                                            {key}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="payment-modal__mixed-summary">
                                <div className="payment-modal__mixed-row">
                                    <span><CashIcon size={18} /> Espèces</span>
                                    <span>{formatPrice(Math.min(cashReceived, totalAmount))}</span>
                                </div>
                                <div className="payment-modal__mixed-row">
                                    <span><CardIcon size={18} /> Carte</span>
                                    <span>{formatPrice(Math.max(0, totalAmount - cashReceived))}</span>
                                </div>
                                {changeGiven > 0 && (
                                    <>
                                        <div className="payment-modal__mixed-row payment-modal__mixed-row--change">
                                            <span>Rendu</span>
                                            <span>{formatPrice(changeGiven)}</span>
                                        </div>
                                        <div className="payment-modal__breakdown">
                                            {changeBreakdown.map((item, idx) => (
                                                <div key={idx} className={`breakdown-item breakdown-item--${item.type}`}>
                                                    <span className="breakdown-count">{item.count}x</span>
                                                    <span className={`breakdown-icon breakdown-icon--${item.value.toString().replace('.', '-')}`}>
                                                        {item.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <Button
                                variant="primary"
                                size="xl"
                                isFullWidth
                                onClick={handleConfirmPayment}
                                disabled={cashReceived <= 0 || !isPaymentValid}
                            >
                                <CheckIcon size={18} /> Valider le paiement
                            </Button>
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="payment-modal__complete">
                            <div className="payment-modal__success-icon">
                                <CheckIcon size={48} />
                            </div>
                            <h3>Vente terminée !</h3>
                            {changeGiven > 0 && (
                                <p className="payment-modal__success-change">
                                    Rendu : <strong>{formatPrice(changeGiven)}</strong>
                                </p>
                            )}

                            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <Button variant="primary" onClick={onCancel}>
                                    Nouvelle vente
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <TicketsModal
                isOpen={showTickets}
                onClose={() => setShowTickets(false)}
                items={cartItems}
                sellerName={sellerName || 'Inconnu'}
                date={new Date()}
            />
        </div>
    );
};

export default PaymentModal;
