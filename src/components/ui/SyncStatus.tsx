// ===================================
// SyncStatus - Connection Status Indicator
// ===================================

import React, { useEffect, useCallback } from 'react';
import { useSyncStore } from '../../stores';
import './SyncStatus.css';

interface SyncStatusProps {
    showDetails?: boolean;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ showDetails = false }) => {
    const {
        isOnline,
        isSyncing,
        lastSyncAt,
        checkConnection,
        syncAll,
        getPendingCount,
    } = useSyncStore();

    const pendingCount = getPendingCount();

    // Check connection on mount and periodically
    useEffect(() => {
        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, [checkConnection]);

    const handleManualSync = useCallback(() => {
        if (!isSyncing) {
            syncAll();
        }
    }, [isSyncing, syncAll]);

    const formatTime = (date: Date | null): string => {
        if (!date) return 'Jamais';
        return new Date(date).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div
            className={`sync-status ${isOnline ? 'sync-status--online' : 'sync-status--offline'}`}
            onClick={handleManualSync}
            style={{ cursor: 'pointer' }}
            title="Cliquer pour synchroniser maintenant"
        >
            <div className="sync-status__indicator">
                <span className={`sync-status__dot ${isSyncing ? 'sync-status__dot--syncing' : ''}`} />
                <span className="sync-status__label">
                    {isSyncing ? 'Sync...' : isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
            </div>

            {pendingCount > 0 && (
                <span className="sync-status__badge">{pendingCount}</span>
            )}

            {showDetails && (
                <div className="sync-status__details">
                    <div className="sync-status__info">
                        <span>Dernière sync: {formatTime(lastSyncAt)}</span>
                        {pendingCount > 0 && (
                            <span>{pendingCount} en attente</span>
                        )}
                    </div>
                    <button
                        className="sync-status__sync-btn"
                        onClick={handleManualSync}
                        disabled={isSyncing || pendingCount === 0}
                        type="button"
                    >
                        {isSyncing ? '↻' : '⟳'} Sync
                    </button>
                </div>
            )}
        </div>
    );
};

export default SyncStatus;
