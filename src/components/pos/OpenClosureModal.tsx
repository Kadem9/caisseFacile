import React, { useState } from 'react';
import { Button, DrawerIcon, XIcon } from '../ui';
import { CashCounter } from './CashCounter';
import './CashModals.css';

interface OpenClosureModalProps {
    isOpen: boolean;
    onConfirm: (initialAmount: number) => void;
    onClose?: () => void;
}

export const OpenClosureModal: React.FC<OpenClosureModalProps> = ({ isOpen, onConfirm, onClose }) => {
    const [amount, setAmount] = useState(0);

    if (!isOpen) return null;

    return (
        <div className="payment-modal__overlay">
            <div className="payment-modal" style={{ width: '1000px', maxWidth: '95vw', height: '85vh', maxHeight: '800px', flexDirection: 'row', overflow: 'hidden' }}>

                {/* Left Panel: Instructions & Actions */}
                <div style={{
                    flex: '0 0 350px',
                    background: '#f8fafc',
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: '1px solid #e2e8f0'
                }}>
                    <header style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem' }}>Ouverture</h2>
                                <p style={{ color: '#64748b', lineHeight: '1.5' }}>Veuillez compter le fond de caisse présent dans le tiroir.</p>
                            </div>
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#94a3b8',
                                        padding: '0.5rem',
                                        borderRadius: '50%',
                                        transition: 'background 0.2s',
                                        marginLeft: '1rem'
                                    }}
                                    className="hover:bg-slate-200 hover:text-slate-800"
                                >
                                    <XIcon size={24} />
                                </button>
                            )}
                        </div>
                    </header>

                    <div style={{
                        background: '#ffffff',
                        padding: '2rem',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        textAlign: 'center',
                        marginBottom: 'auto',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}>
                        <span style={{ display: 'block', color: '#64748b', fontWeight: '600', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Total compté
                        </span>
                        <span style={{ display: 'block', fontSize: '3rem', fontWeight: '800', color: '#059669', lineHeight: '1' }}>
                            {amount.toFixed(2).replace('.', ',')} €
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                        <Button
                            variant="secondary"
                            isFullWidth
                            size="lg"
                            onClick={() => console.log('Opening drawer...')}
                        >
                            <DrawerIcon size={20} /> Ouvrir Tiroir
                        </Button>
                        <Button
                            variant="primary"
                            size="xl"
                            isFullWidth
                            onClick={() => onConfirm(amount)}
                            disabled={amount <= 0}
                            style={{ height: '60px', fontSize: '1.1rem' }}
                        >
                            Valider et Ouvrir
                        </Button>
                    </div>
                </div>

                {/* Right Panel: Cash Counter Grid */}
                <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', background: '#ffffff' }}>
                    <CashCounter onChange={setAmount} showTotal={false} />
                </div>

            </div>
        </div>
    );
};
