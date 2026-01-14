// ===================================
// Button Component - Reusable UI Button
// ===================================

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isFullWidth?: boolean;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    isFullWidth = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    className = '',
    disabled,
    ...props
}) => {
    const baseClass = 'btn';
    const variantClass = `btn--${variant}`;
    const sizeClass = size !== 'md' ? `btn--${size}` : '';
    const fullWidthClass = isFullWidth ? 'btn--block' : '';

    const classes = [
        baseClass,
        variantClass,
        sizeClass,
        fullWidthClass,
        className,
    ].filter(Boolean).join(' ');

    return (
        <button
            className={classes}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <span className="btn__spinner" aria-hidden="true">⏳</span>
            ) : (
                <>
                    {leftIcon && <span className="btn__icon">{leftIcon}</span>}
                    {children}
                    {rightIcon && <span className="btn__icon">{rightIcon}</span>}
                </>
            )}
        </button>
    );
};

export default Button;
