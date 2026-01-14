// ===================================
// PIN Display Component
// ===================================

import React from 'react';
import './PinDisplay.css';

interface PinDisplayProps {
    length: number;
    maxLength?: number;
    isError?: boolean;
}

export const PinDisplay: React.FC<PinDisplayProps> = ({
    length,
    maxLength = 4,
    isError = false,
}) => {
    return (
        <div className={`pin-display ${isError ? 'pin-display--error' : ''}`}>
            {Array.from({ length: maxLength }).map((_, index) => (
                <div
                    key={index}
                    className={`pin-display__dot ${index < length ? 'pin-display__dot--filled' : ''}`}
                    aria-hidden="true"
                />
            ))}
        </div>
    );
};

export default PinDisplay;
