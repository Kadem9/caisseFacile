// ===================================
// User Card Component - Selectable User Avatar
// ===================================

import React from 'react';
import type { User } from '../../types';
import './UserCard.css';

interface UserCardProps {
    user: User;
    onSelect: (user: User) => void;
    isSelected?: boolean;
}

// Get initials from user name
const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
};

// Generate a consistent color based on user name
const getAvatarColor = (name: string): string => {
    const colors = [
        '#2563eb', // blue
        '#10b981', // green
        '#f59e0b', // amber
        '#8b5cf6', // purple
        '#ec4899', // pink
        '#06b6d4', // cyan
        '#f97316', // orange
        '#14b8a6', // teal
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
};

const ROLE_TRANSLATIONS: Record<string, string> = {
    admin: 'Administrateur',
    manager: 'Gérant',
    cashier: 'Vendeur',
};

export const UserCard: React.FC<UserCardProps> = ({
    user,
    onSelect,
    isSelected = false,
}) => {
    const initials = getInitials(user.name);
    const avatarColor = getAvatarColor(user.name);

    return (
        <button
            className={`user-card ${isSelected ? 'user-card--selected' : ''}`}
            onClick={() => onSelect(user)}
            type="button"
        >
            <div
                className="user-card__avatar"
                style={{ backgroundColor: avatarColor }}
            >
                {initials}
            </div>
            <span className="user-card__name">{user.name}</span>
            <span className="user-card__role">{ROLE_TRANSLATIONS[user.role] || user.role}</span>
        </button>
    );
};

export default UserCard;
