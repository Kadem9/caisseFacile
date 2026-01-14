// ===================================
// UpdateChecker - Auto-Update Component
// ===================================

import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateCheckerProps {
    onUpdateAvailable?: (version: string) => void;
}

export const UpdateChecker: React.FC<UpdateCheckerProps> = ({ onUpdateAvailable }) => {
    const [updateStatus, setUpdateStatus] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        checkForUpdates();
    }, []);

    const checkForUpdates = async () => {
        // Only run in Tauri environment
        if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
            return;
        }

        setIsChecking(true);
        setUpdateStatus('Vérification des mises à jour...');

        try {
            const update = await check();

            if (update) {
                console.log(`[Updater] Update available: ${update.version}`);
                setUpdateStatus(`Nouvelle version disponible: ${update.version}`);
                onUpdateAvailable?.(update.version);

                const shouldUpdate = await ask(
                    `Une nouvelle version (${update.version}) est disponible.\n\nVoulez-vous l'installer maintenant ?`,
                    {
                        title: 'Mise à jour disponible',
                        kind: 'info',
                        okLabel: 'Installer',
                        cancelLabel: 'Plus tard'
                    }
                );

                if (shouldUpdate) {
                    setUpdateStatus('Téléchargement en cours...');

                    let downloaded = 0;
                    let totalSize = 0;

                    await update.downloadAndInstall((event) => {
                        switch (event.event) {
                            case 'Started':
                                totalSize = event.data.contentLength || 0;
                                setUpdateStatus(`Téléchargement: 0%`);
                                break;
                            case 'Progress':
                                downloaded += event.data.chunkLength;
                                const percent = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
                                setUpdateStatus(`Téléchargement: ${percent}%`);
                                break;
                            case 'Finished':
                                setUpdateStatus('Installation terminée, redémarrage...');
                                break;
                        }
                    });

                    // Relaunch the app after update
                    await relaunch();
                }
            } else {
                console.log('[Updater] No update available');
                setUpdateStatus(null);
            }
        } catch (error) {
            console.error('[Updater] Error checking for updates:', error);
            setUpdateStatus(null);
        } finally {
            setIsChecking(false);
        }
    };

    // Don't render anything if not checking or no update
    if (!updateStatus && !isChecking) {
        return null;
    }

    return (
        <div className="update-checker" style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            fontSize: '14px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }}>
            {isChecking && (
                <div className="spinner" style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }} />
            )}
            <span>{updateStatus}</span>
            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default UpdateChecker;
