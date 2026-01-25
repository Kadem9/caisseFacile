import React from 'react';
import { XIcon, CheckIcon, ArrowLeftIcon } from './Icons';
import './VirtualKeyboard.css';

interface VirtualKeyboardProps {
    isOpen: boolean;
    onClose: () => void;
    onInput: (value: string) => void;
    value: string;
    title?: string;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
    isOpen,
    onClose,
    onInput,
    value,
    title = 'Saisie Clavier'
}) => {
    if (!isOpen) return null;

    const handleKeyPress = (key: string) => {
        onInput(value + key);
    };

    const handleBackspace = () => {
        onInput(value.slice(0, -1));
    };

    const handleSpace = () => {
        onInput(value + ' ');
    };

    const handleClear = () => {
        onInput('');
    };

    const rows = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
        ['W', 'X', 'C', 'V', 'B', 'N', '\'', '.', '-', '?']
    ];

    return (
        <div className="virtual-keyboard-overlay">
            <div className="virtual-keyboard-container">
                <div className="virtual-keyboard-header">
                    <span className="virtual-keyboard-title">{title}</span>
                    <button className="virtual-keyboard-close" onClick={onClose}>
                        <XIcon size={24} />
                    </button>
                </div>

                <div className="virtual-keyboard-display">
                    {value || <span className="placeholder">Appuyez sur les touches...</span>}
                    <span className="cursor">|</span>
                </div>

                <div className="virtual-keyboard-keys">
                    {rows.map((row, rowIndex) => (
                        <div key={rowIndex} className="keyboard-row">
                            {row.map((char) => (
                                <button
                                    key={char}
                                    className="keyboard-key"
                                    onClick={() => handleKeyPress(char)}
                                >
                                    {char}
                                </button>
                            ))}
                        </div>
                    ))}

                    {/* Action Row */}
                    <div className="keyboard-row action-row">
                        <button className="keyboard-key key-clear" onClick={handleClear}>
                            Effacer
                        </button>
                        <button className="keyboard-key key-space" onClick={handleSpace}>
                            Espace
                        </button>
                        <button className="keyboard-key key-backspace" onClick={handleBackspace}>
                            <ArrowLeftIcon size={20} />
                        </button>
                        <button className="keyboard-key key-enter" onClick={onClose}>
                            <CheckIcon size={20} /> Valider
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
