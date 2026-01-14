// ===================================
// Auth Store - User Authentication State
// ===================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
    // State
    currentUser: User | null;
    isAuthenticated: boolean;
    availableUsers: User[];

    // Actions
    setAvailableUsers: (users: User[]) => void;
    login: (user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            // Initial state
            currentUser: null,
            isAuthenticated: false,
            availableUsers: [],

            // Actions
            setAvailableUsers: (users) => set({ availableUsers: users }),

            login: (user) => set({
                currentUser: user,
                isAuthenticated: true
            }),

            logout: () => set({
                currentUser: null,
                isAuthenticated: false
            }),
        }),
        {
            name: 'ma-caisse-auth',
            partialize: (state) => ({
                // Only persist the current user for session restoration
                currentUser: state.currentUser,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
