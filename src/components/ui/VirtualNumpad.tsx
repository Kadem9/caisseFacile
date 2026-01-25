import React from 'react';
import './VirtualNumpad.css';

interface VirtualNumpadProps {
    onDigit: (digit: string) => void;
    onClear?: () => void;
    onBackspace?: () => void;
    className?: string;
}

export const VirtualNumpad: React.FC<VirtualNumpadProps> = ({
    onDigit,
    onClear,
    onBackspace,
    className = ''
}) => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

    const handleClick = (key: string) => {
        if (key === '⌫') {
            onBackspace?.();
        } else {
            onDigit(key);
        }
    };

    return (
        <div className={`virtual-numpad ${className}`}>
            <div className="virtual-numpad__grid">
                {keys.map((key) => (
                    <button
                        key={key}
                        className={`btn-numpad ${key === '⌫' ? 'btn-numpad--action' : ''}`}
                        onClick={() => handleClick(key)}
                        type="button"
                    >
                        {key}
                    </button>
                ))}
            </div>
            {onClear && (
                <button
                    className="btn-numpad btn-numpad--clear"
                    onClick={onClear}
                    type="button"
                >
                    Effacer
                </button>
            )}
        </div>
    );
};
