// ===================================
// Settings Page - Hardware Configuration
// ===================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
    Button,
    ArrowLeftIcon,
    SettingsIcon,
    PrinterIcon,
    DrawerIcon,
    SyncIcon,
    CheckIcon,
    XIcon,
    RefreshIcon,
    SearchIcon,
    MonitorIcon,
    LightbulbIcon,
    WifiIcon
} from '../components/ui';
import './SettingsPage.css';
import {
    getApiUrl,
    setApiUrl as setApiUrlService,
    DEFAULT_API_URL,
    checkHealth,
} from '../services/api';

interface SerialPortInfo {
    name: string;
    port_type: string;
    manufacturer: string | null;
    product: string | null;
}

interface HardwareStatus {
    printer_connected: boolean;
    printer_port: string | null;
    drawer_connected: boolean;
    drawer_port: string | null;
}

interface SystemPrinterInfo {
    name: string;
    driver_name: string;
    is_default: boolean;
}

type ConnectionMode = 'serial' | 'driver';

interface HardwareConfig {
    connectionMode: ConnectionMode;
    printerPort: string;
    printerBaudRate: number;
    paperWidth: number;
    drawerPort: string;
    drawerPin: number;
    systemPrinterName: string;
}

const DEFAULT_CONFIG: HardwareConfig = {
    connectionMode: 'driver',
    printerPort: '',
    printerBaudRate: 9600,
    paperWidth: 80,
    drawerPort: '',
    drawerPin: 0,
    systemPrinterName: '',
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export const SettingsPage: React.FC = () => {
    const navigate = useNavigate();

    // State
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [config, setConfig] = useState<HardwareConfig>(() => {
        const saved = localStorage.getItem('ma-caisse-hardware-config');
        return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    });
    const [status, setStatus] = useState<HardwareStatus | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'printer' | 'drawer' | 'sync'>('printer');
    const [isCheckingSync, setIsCheckingSync] = useState(false);
    const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [systemPrinters, setSystemPrinters] = useState<SystemPrinterInfo[]>([]);

    // Load configuration on mount
    useEffect(() => {
        scanPorts();
        scanSystemPrinters();
        checkStatus();
    }, []);

    // Save configuration when it changes
    useEffect(() => {
        localStorage.setItem('ma-caisse-hardware-config', JSON.stringify(config));
    }, [config]);

    const scanPorts = useCallback(async () => {
        setIsScanning(true);
        try {
            const result = await invoke<SerialPortInfo[]>('list_serial_ports');
            setPorts(result);
        } catch (err) {
            console.error('Failed to scan ports:', err);
            setPorts([]);
        } finally {
            setIsScanning(false);
        }
    }, []);

    const scanSystemPrinters = useCallback(async () => {
        try {
            const result = await invoke<SystemPrinterInfo[]>('list_system_printers');
            setSystemPrinters(result);
            // Auto-select default printer if none selected
            if (!config.systemPrinterName && result.length > 0) {
                const defaultPrinter = result.find(p => p.is_default) || result[0];
                setConfig(prev => ({ ...prev, systemPrinterName: defaultPrinter.name }));
            }
        } catch (err) {
            console.error('Failed to list system printers:', err);
            setSystemPrinters([]);
        }
    }, [config.systemPrinterName]);

    const checkStatus = useCallback(async () => {
        try {
            const result = await invoke<HardwareStatus>('check_hardware_status', {
                printerPort: config.printerPort || null,
                drawerPort: config.drawerPort || null,
            });
            setStatus(result);
        } catch (err) {
            console.error('Failed to check status:', err);
        }
    }, [config.printerPort, config.drawerPort]);

    const handleTestPrinter = useCallback(async () => {
        setTestResult(null);

        if (config.connectionMode === 'driver') {
            // Test via Windows driver
            if (!config.systemPrinterName) {
                setTestResult({ type: 'error', message: 'Sélectionnez une imprimante système' });
                return;
            }
            try {
                const result = await invoke<string>('test_printer_driver', {
                    printerName: config.systemPrinterName,
                });
                setTestResult({ type: 'success', message: result });
            } catch (err) {
                setTestResult({ type: 'error', message: String(err) });
            }
        } else {
            // Test via serial port
            if (!config.printerPort) {
                setTestResult({ type: 'error', message: 'Sélectionnez un port imprimante' });
                return;
            }
            try {
                const result = await invoke<string>('test_printer', {
                    portName: config.printerPort,
                    baudRate: config.printerBaudRate,
                });
                setTestResult({ type: 'success', message: result });
            } catch (err) {
                setTestResult({ type: 'error', message: String(err) });
            }
        }
    }, [config.connectionMode, config.systemPrinterName, config.printerPort, config.printerBaudRate]);

    const handleOpenDrawer = useCallback(async () => {
        setTestResult(null);

        if (config.connectionMode === 'driver') {
            // Open drawer via Windows driver
            if (!config.systemPrinterName) {
                setTestResult({ type: 'error', message: 'Sélectionnez une imprimante système' });
                return;
            }
            try {
                const result = await invoke<string>('open_drawer_via_driver', {
                    printerName: config.systemPrinterName,
                    pin: config.drawerPin,
                });
                setTestResult({ type: 'success', message: result });
            } catch (err) {
                setTestResult({ type: 'error', message: String(err) });
            }
        } else {
            // Open drawer via serial port
            const port = config.drawerPort || config.printerPort;
            if (!port) {
                setTestResult({ type: 'error', message: 'Sélectionnez un port' });
                return;
            }
            try {
                const result = await invoke<string>('open_cash_drawer', {
                    portName: port,
                    baudRate: config.printerBaudRate,
                    pin: config.drawerPin,
                });
                setTestResult({ type: 'success', message: result });
            } catch (err) {
                setTestResult({ type: 'error', message: String(err) });
            }
        }
    }, [config.connectionMode, config.systemPrinterName, config.drawerPort, config.printerPort, config.printerBaudRate, config.drawerPin]);

    const handleBack = useCallback(() => {
        navigate('/pos');
    }, [navigate]);

    const handleCheckConnection = useCallback(async () => {
        setIsCheckingSync(true);
        setSyncStatus(null);
        try {
            const result = await checkHealth();
            if (result.success) {
                setSyncStatus({ type: 'success', message: 'Connexion au serveur établie !' });
            } else {
                setSyncStatus({ type: 'error', message: result.error || 'Le serveur a répondu avec une erreur.' });
            }
        } catch (err) {
            setSyncStatus({ type: 'error', message: `Erreur de connexion : ${String(err)}` });
        } finally {
            setIsCheckingSync(false);
        }
    }, []);

    return (
        <div className="settings-page">
            {/* Header */}
            <header className="settings-header">
                <div className="settings-header__left">
                    <button className="settings-header__back" onClick={handleBack} type="button">
                        <ArrowLeftIcon size={24} />
                    </button>
                    <h1 className="settings-header__title">
                        <SettingsIcon size={24} className="inline mr-2" />
                        Paramètres
                    </h1>
                </div>
            </header>

            <main className="settings-main">
                {/* Tabs */}
                <nav className="settings-tabs">
                    <button
                        className={`settings-tab ${activeTab === 'printer' ? 'settings-tab--active' : ''}`}
                        onClick={() => setActiveTab('printer')}
                        type="button"
                    >
                        <PrinterIcon size={18} className="inline mr-2" /> Imprimante
                    </button>
                    <button
                        className={`settings-tab ${activeTab === 'drawer' ? 'settings-tab--active' : ''}`}
                        onClick={() => setActiveTab('drawer')}
                        type="button"
                    >
                        <DrawerIcon size={18} className="inline mr-2" /> Tiroir-caisse
                    </button>
                    <button
                        className={`settings-tab ${activeTab === 'sync' ? 'settings-tab--active' : ''}`}
                        onClick={() => setActiveTab('sync')}
                        type="button"
                    >
                        <SyncIcon size={18} className="inline mr-2" /> Synchronisation
                    </button>
                </nav>

                {/* Content */}
                <div className="settings-content">
                    {/* Test Result Alert */}
                    {testResult && (
                        <div className={`settings-alert settings-alert--${testResult.type}`}>
                            {testResult.type === 'success' ? (
                                <CheckIcon size={20} className="inline mr-2" />
                            ) : (
                                <XIcon size={20} className="inline mr-2" />
                            )}
                            {testResult.message}
                            <button
                                className="settings-alert__close"
                                onClick={() => setTestResult(null)}
                                type="button"
                            >
                                <XIcon size={16} />
                            </button>
                        </div>
                    )}

                    {/* Printer Tab */}
                    {activeTab === 'printer' && (
                        <div className="settings-section">
                            <div className="settings-section__header">
                                <h2>Configuration Imprimante</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={config.connectionMode === 'driver' ? scanSystemPrinters : scanPorts}
                                    disabled={isScanning}
                                >
                                    {isScanning ? (
                                        <><RefreshIcon size={16} className="animate-spin mr-2" /> Scan...</>
                                    ) : (
                                        <><SearchIcon size={16} className="mr-2" /> Actualiser</>
                                    )}
                                </Button>
                            </div>

                            <div className="settings-form">
                                {/* Connection Mode Toggle */}
                                <div className="settings-form__group">
                                    <label>Mode de connexion</label>
                                    <div className="settings-radio-group">
                                        <label className={`settings-radio ${config.connectionMode === 'driver' ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="connectionMode"
                                                value="driver"
                                                checked={config.connectionMode === 'driver'}
                                                onChange={() => setConfig({ ...config, connectionMode: 'driver' })}
                                            />
                                            Pilote Windows
                                        </label>
                                        <label className={`settings-radio ${config.connectionMode === 'serial' ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="connectionMode"
                                                value="serial"
                                                checked={config.connectionMode === 'serial'}
                                                onChange={() => setConfig({ ...config, connectionMode: 'serial' })}
                                            />
                                            Port série (COM)
                                        </label>
                                    </div>
                                </div>

                                {/* Driver Mode */}
                                {config.connectionMode === 'driver' && (
                                    <div className="settings-form__group">
                                        <label>Imprimante système</label>
                                        <select
                                            value={config.systemPrinterName}
                                            onChange={(e) => setConfig({ ...config, systemPrinterName: e.target.value })}
                                        >
                                            <option value="">-- Sélectionner --</option>
                                            {systemPrinters.map((printer) => (
                                                <option key={printer.name} value={printer.name}>
                                                    {printer.name} {printer.is_default && '(défaut)'}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="settings-form__help">
                                            Sélectionnez l'imprimante ticket installée dans Windows (ex: PPTII-A)
                                        </p>
                                    </div>
                                )}

                                {/* Serial Mode */}
                                {config.connectionMode === 'serial' && (
                                    <>
                                        <div className="settings-form__group">
                                            <label>Port série</label>
                                            <select
                                                value={config.printerPort}
                                                onChange={(e) => setConfig({ ...config, printerPort: e.target.value })}
                                            >
                                                <option value="">-- Sélectionner --</option>
                                                {ports.map((port) => (
                                                    <option key={port.name} value={port.name}>
                                                        {port.name} ({port.port_type})
                                                        {port.product && ` - ${port.product}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="settings-form__group">
                                            <label>Vitesse (baud rate)</label>
                                            <select
                                                value={config.printerBaudRate}
                                                onChange={(e) => setConfig({ ...config, printerBaudRate: Number(e.target.value) })}
                                            >
                                                {BAUD_RATES.map((rate) => (
                                                    <option key={rate} value={rate}>
                                                        {rate}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* Paper Width - common to both modes */}
                                <div className="settings-form__group">
                                    <label>Largeur papier</label>
                                    <div className="settings-radio-group">
                                        <label className={`settings-radio ${config.paperWidth === 58 ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="paperWidth"
                                                value="58"
                                                checked={config.paperWidth === 58}
                                                onChange={() => setConfig({ ...config, paperWidth: 58 })}
                                            />
                                            58mm
                                        </label>
                                        <label className={`settings-radio ${config.paperWidth === 80 ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="paperWidth"
                                                value="80"
                                                checked={config.paperWidth === 80}
                                                onChange={() => setConfig({ ...config, paperWidth: 80 })}
                                            />
                                            80mm
                                        </label>
                                    </div>
                                </div>

                                <div className="settings-form__actions">
                                    <Button variant="secondary" onClick={handleTestPrinter}>
                                        <MonitorIcon size={16} className="mr-2" /> Tester l'impression
                                    </Button>
                                </div>
                            </div>

                            {/* Status */}
                            {config.connectionMode === 'serial' && (
                                <div className="settings-status">
                                    <div className={`settings-status__indicator ${status?.printer_connected ? 'settings-status__indicator--connected' : ''}`}>
                                        <span className="settings-status__dot" />
                                        <span>{status?.printer_connected ? 'Imprimante connectée' : 'Non connectée'}</span>
                                    </div>
                                </div>
                            )}
                            {config.connectionMode === 'driver' && config.systemPrinterName && (
                                <div className="settings-status">
                                    <div className="settings-status__indicator settings-status__indicator--connected">
                                        <span className="settings-status__dot" />
                                        <span>Prêt: {config.systemPrinterName}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Drawer Tab */}
                    {activeTab === 'drawer' && (
                        <div className="settings-section">
                            <div className="settings-section__header">
                                <h2>Configuration Tiroir-caisse</h2>
                            </div>

                            <div className="settings-form">
                                <div className="settings-form__info">
                                    <p>
                                        <LightbulbIcon size={16} className="inline mr-1" />
                                        La plupart des tiroirs-caisse sont connectés via l'imprimante.
                                        Si c'est votre cas, laissez le port vide - le tiroir utilisera
                                        le port de l'imprimante.
                                    </p>
                                </div>

                                <div className="settings-form__group">
                                    <label>Port série (optionnel)</label>
                                    <select
                                        value={config.drawerPort}
                                        onChange={(e) => setConfig({ ...config, drawerPort: e.target.value })}
                                    >
                                        <option value="">Via imprimante</option>
                                        {ports.map((port) => (
                                            <option key={port.name} value={port.name}>
                                                {port.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="settings-form__group">
                                    <label>Pin de déclenchement</label>
                                    <div className="settings-radio-group">
                                        <label className={`settings-radio ${config.drawerPin === 0 ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="drawerPin"
                                                value="0"
                                                checked={config.drawerPin === 0}
                                                onChange={() => setConfig({ ...config, drawerPin: 0 })}
                                            />
                                            Pin 2 (standard)
                                        </label>
                                        <label className={`settings-radio ${config.drawerPin === 5 ? 'settings-radio--active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="drawerPin"
                                                value="5"
                                                checked={config.drawerPin === 5}
                                                onChange={() => setConfig({ ...config, drawerPin: 5 })}
                                            />
                                            Pin 5
                                        </label>
                                    </div>
                                </div>

                                <div className="settings-form__actions">
                                    <Button variant="secondary" onClick={handleOpenDrawer}>
                                        <MonitorIcon size={16} className="mr-2" /> Tester le tiroir
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sync Tab */}
                    {activeTab === 'sync' && (
                        <div className="settings-section">
                            <div className="settings-section__header">
                                <h2>Configuration Synchronisation</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setApiUrlService(DEFAULT_API_URL);
                                        window.location.reload();
                                    }}
                                >
                                    <RefreshIcon size={16} className="mr-2" /> Réinitialiser par défaut
                                </Button>
                            </div>

                            <div className="settings-form">
                                <div className="settings-form__group">
                                    <label>URL du serveur</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="url"
                                            placeholder={DEFAULT_API_URL}
                                            value={getApiUrl()}
                                            onChange={(e) => {
                                                setApiUrlService(e.target.value);
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={handleCheckConnection}
                                            disabled={isCheckingSync}
                                        >
                                            {isCheckingSync ? (
                                                <RefreshIcon size={16} className="animate-spin" />
                                            ) : (
                                                <><WifiIcon size={16} className="mr-2" /> Tester</>
                                            )}
                                        </Button>
                                    </div>
                                    <p className="settings-form__help">
                                        URL actuelle : <code>{getApiUrl()}</code>
                                    </p>
                                </div>

                                {syncStatus && (
                                    <div className={`settings-alert settings-alert--${syncStatus.type}`} style={{ padding: '8px', marginBottom: '15px' }}>
                                        {syncStatus.type === 'success' ? (
                                            <CheckIcon size={20} className="inline mr-2" />
                                        ) : (
                                            <XIcon size={20} className="inline mr-2" />
                                        )}
                                        {syncStatus.message}
                                    </div>
                                )}

                                <div className="settings-form__info">
                                    <p>
                                        <WifiIcon size={16} className="inline mr-2" />
                                        Le serveur backend permet de synchroniser les données
                                        vers un dashboard distant. Assurez-vous que le serveur est
                                        accessible à l'adresse indiquée.
                                    </p>
                                    <p style={{ marginTop: '10px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        <LightbulbIcon size={16} className="inline mr-1" />
                                        Si vous changez l'URL, il est recommandé de redémarrer l'application.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SettingsPage;
