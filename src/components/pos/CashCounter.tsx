import React, { useState, useMemo, useEffect } from 'react';
import { EuroIcon, PlusIcon, MinusIcon } from '../ui';
import './CashCounter.css';

interface CashCounterProps {
    onChange: (total: number) => void;
    initialValues?: Record<number, number>;
    showTotal?: boolean;
    className?: string;
}

const DENOMINATIONS = [
    { value: 500, type: 'bill', label: '500 €' },
    { value: 200, type: 'bill', label: '200 €' },
    { value: 100, type: 'bill', label: '100 €' },
    { value: 50, type: 'bill', label: '50 €' },
    { value: 20, type: 'bill', label: '20 €' },
    { value: 10, type: 'bill', label: '10 €' },
    { value: 5, type: 'bill', label: '5 €' },
    { value: 2, type: 'coin', label: '2 €' },
    { value: 1, type: 'coin', label: '1 €' },
    { value: 0.5, type: 'coin', label: '50 ct' },
    { value: 0.2, type: 'coin', label: '20 ct' },
    { value: 0.1, type: 'coin', label: '10 ct' },
    { value: 0.05, type: 'coin', label: '5 ct' },
    { value: 0.02, type: 'coin', label: '2 ct' },
    { value: 0.01, type: 'coin', label: '1 ct' },
];

export const CashCounter: React.FC<CashCounterProps> = ({
    onChange,
    initialValues = {},
    showTotal = true,
    className = ''
}) => {
    const [counts, setCounts] = useState<Record<number, number>>(initialValues);

    const handleCountChange = (value: number, inputVal: string) => {
        const numCount = inputVal === '' ? 0 : parseInt(inputVal);
        if (isNaN(numCount)) return;
        setCounts(prev => ({ ...prev, [value]: numCount }));
    };

    const increment = (value: number) => {
        setCounts(prev => ({ ...prev, [value]: (prev[value] || 0) + 1 }));
    };

    const decrement = (value: number) => {
        setCounts(prev => ({ ...prev, [value]: Math.max(0, (prev[value] || 0) - 1) }));
    };

    const total = useMemo(() => {
        return DENOMINATIONS.reduce((sum, d) => sum + (d.value * (counts[d.value] || 0)), 0);
    }, [counts]);

    useEffect(() => {
        onChange(total);
    }, [total, onChange]);

    const formatPrice = (price: number) => price.toFixed(2).replace('.', ',') + ' €';

    const renderItem = (d: typeof DENOMINATIONS[0]) => (
        <div key={d.value} className="cash-counter__item">
            <span className={`cash-counter__item-label ${d.type}`}>{d.label}</span>

            <div className="cash-counter__controls">
                <button
                    className="cc-btn cc-btn--minus"
                    onClick={() => decrement(d.value)}
                    type="button"
                >
                    <MinusIcon size={16} />
                </button>

                <input
                    type="number"
                    min="0"
                    className="cash-counter__input"
                    value={counts[d.value] || ''}
                    placeholder="0"
                    onChange={(e) => handleCountChange(d.value, e.target.value)}
                    onFocus={(e) => e.target.select()}
                />

                <button
                    className="cc-btn cc-btn--plus"
                    onClick={() => increment(d.value)}
                    type="button"
                >
                    <PlusIcon size={16} />
                </button>
            </div>

            <span className="cash-counter__item-subtotal">
                {formatPrice(d.value * (counts[d.value] || 0))}
            </span>
        </div>
    );

    return (
        <div className={`cash-counter ${className}`}>
            {showTotal && (
                <div className="cash-counter__total">
                    <span className="label"><EuroIcon size={20} /> Total compté</span>
                    <span className="value">{formatPrice(total)}</span>
                </div>
            )}

            <div className="cash-counter__grid">
                <div className="cash-counter__section">
                    <h3>Billets</h3>
                    <div className="cash-counter__items">
                        {DENOMINATIONS.filter(d => d.type === 'bill').map(renderItem)}
                    </div>
                </div>

                <div className="cash-counter__section">
                    <h3>Pièces</h3>
                    <div className="cash-counter__items">
                        {DENOMINATIONS.filter(d => d.type === 'coin').map(renderItem)}
                    </div>
                </div>
            </div>
        </div>
    );
};
