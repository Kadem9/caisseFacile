// ===================================
// NumPad Component - PIN Entry Keypad
// ===================================

import React from 'react';
import './NumPad.css';

interface NumPadProps {
    onDigitPress: (digit: string) => void;
    onBackspace: () => void;
    onClear: () => void;
    onConfirm?: () => void;
    showConfirm?: boolean;
    disabled?: boolean;
}

export const NumPad: React.FC<NumPadProps> = ({
    onDigitPress,
    onBackspace,
    onClear,
    onConfirm,
    showConfirm = true,
    disabled = false,
}) => {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    const handleKeyPress = (key: string) => {
        if (disabled) return;
        onDigitPress(key);
    };

    return (
        <div className="numpad">
            <div className="numpad__grid">
                {/* Row 1: 1, 2, 3 */}
                {digits.slice(0, 3).map((digit) => (
                    <button
                        key={digit}
                        className="btn btn--numpad"
                        onClick={() => handleKeyPress(digit)}
                        disabled={disabled}
                        type="button"
                    >
                        {digit}
                    </button>
                ))}

                {/* Row 2: 4, 5, 6 */}
                {digits.slice(3, 6).map((digit) => (
                    <button
                        key={digit}
                        className="btn btn--numpad"
                        onClick={() => handleKeyPress(digit)}
                        disabled={disabled}
                        type="button"
                    >
                        {digit}
                    </button>
                ))}

                {/* Row 3: 7, 8, 9 */}
                {digits.slice(6, 9).map((digit) => (
                    <button
                        key={digit}
                        className="btn btn--numpad"
                        onClick={() => handleKeyPress(digit)}
                        disabled={disabled}
                        type="button"
                    >
                        {digit}
                    </button>
                ))}

                {/* Row 4: Clear, 0, Backspace */}
                <button
                    className="btn btn--numpad btn--numpad--danger"
                    onClick={onClear}
                    disabled={disabled}
                    type="button"
                    aria-label="Effacer tout"
                >
                    C
                </button>

                <button
                    className="btn btn--numpad"
                    onClick={() => handleKeyPress('0')}
                    disabled={disabled}
                    type="button"
                >
                    0
                </button>

                <button
                    className="btn btn--numpad"
                    onClick={onBackspace}
                    disabled={disabled}
                    type="button"
                    aria-label="Supprimer"
                >
                    ⌫
                </button>
            </div>

            {/* Confirm Button */}
            {showConfirm && onConfirm && (
                <button
                    className="btn btn--primary btn--xl btn--block numpad__confirm"
                    onClick={onConfirm}
                    disabled={disabled}
                    type="button"
                >
                    Valider
                </button>
            )}
        </div>
    );
};

export default NumPad;
