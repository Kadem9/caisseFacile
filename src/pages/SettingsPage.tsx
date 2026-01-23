// ===================================
// Settings Page - Hardware Configuration
// ===================================

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Button,
    PrinterIcon,
    DrawerIcon,
    SyncIcon,
    CheckIcon,
    XIcon,
    RefreshIcon,
    SearchIcon,
    MonitorIcon,
    LightbulbIcon,
    WifiIcon,
    CardIcon
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

interface TpeDeviceConfig {
    name: string;        // User-friendly name (e.g., "Ingenico Move/5000")
    port: string;        // COM port (e.g., "COM5")
    baudRate: number;    // Baud rate (e.g., 9600)
    posNumber: string;   // POS number for Concert protocol (01-99)
}

interface TpeConfig {
    devices: [TpeDeviceConfig, TpeDeviceConfig]; // Two TPE slots
    activeDeviceIndex: 0 | 1;                     // Which TPE is active
}

const DEFAULT_TPE_CONFIG: TpeConfig = {
    devices: [
        { name: 'Ingenico Move/5000', port: 'COM5', baudRate: 9600, posNumber: '01' },
        { name: 'PAX A920 Pro', port: 'COM6', baudRate: 9600, posNumber: '01' },
    ],
    activeDeviceIndex: 0,
};

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

    // State
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [config, setConfig] = useState<HardwareConfig>(() => {
        const saved = localStorage.getItem('ma-caisse-hardware-config');
        return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    });
    const [status, setStatus] = useState<HardwareStatus | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'printer' | 'drawer' | 'tpe' | 'sync'>('printer');
    const [isCheckingSync, setIsCheckingSync] = useState(false);
    const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [systemPrinters, setSystemPrinters] = useState<SystemPrinterInfo[]>([]);

    // TPE State
    const [tpeConfig, setTpeConfig] = useState<TpeConfig>(() => {
        const saved = localStorage.getItem('ma-caisse-tpe-config');
        return saved ? JSON.parse(saved) : DEFAULT_TPE_CONFIG;
    });
    const [tpeTestResult, setTpeTestResult] = useState<{ deviceIndex: number; type: 'success' | 'error'; message: string } | null>(null);
    const [isTpeTesting, setIsTpeTesting] = useState<number | null>(null);

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

    // Save TPE configuration when it changes
    useEffect(() => {
        localStorage.setItem('ma-caisse-tpe-config', JSON.stringify(tpeConfig));
    }, [tpeConfig]);

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

    const handleTestTpe = useCallback(async (deviceIndex: number) => {
        setIsTpeTesting(deviceIndex);
        setTpeTestResult(null);
        const device = tpeConfig.devices[deviceIndex];
        try {
            const result = await invoke<{ connected: boolean; message: string }>('test_tpe_connection', {
                portName: device.port,
                baudRate: device.baudRate,
            });
            setTpeTestResult({
                deviceIndex,
                type: result.connected ? 'success' : 'error',
                message: result.message,
            });
        } catch (err) {
            setTpeTestResult({
                deviceIndex,
                type: 'error',
                message: String(err),
            });
        } finally {
            setIsTpeTesting(null);
        }
    }, [tpeConfig.devices]);

    const updateTpeDevice = (deviceIndex: number, updates: Partial<TpeDeviceConfig>) => {
        setTpeConfig(prev => {
            const newDevices = [...prev.devices] as [TpeDeviceConfig, TpeDeviceConfig];
            newDevices[deviceIndex] = { ...newDevices[deviceIndex], ...updates };
            return { ...prev, devices: newDevices };
        });
    };

    // Test payment (1 centime) to verify TPE communication
    const handleTestPayment = useCallback(async (deviceIndex: number) => {
        setIsTpeTesting(deviceIndex);
        setTpeTestResult(null);
        const device = tpeConfig.devices[deviceIndex];
        try {
            const result = await invoke<{ success: boolean; transaction_result: string; error_message?: string }>('send_tpe_payment', {
                portName: device.port,
                baudRate: device.baudRate,
                posNumber: device.posNumber,
                amountCents: 1, // 1 centime test
            });
            setTpeTestResult({
                deviceIndex,
                type: result.success ? 'success' : 'error',
                message: result.success ? 'Test paiement réussi ! (1 centime)' : (result.error_message || 'Test échoué'),
            });
        } catch (err) {
            setTpeTestResult({
                deviceIndex,
                type: 'error',
                message: String(err),
            });
        } finally {
            setIsTpeTesting(null);
        }
    }, [tpeConfig.devices]);


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
                <div className="settings-title">
                    <h1>Paramètres</h1>
                    <p>Configuration du matériel et synchronisation</p>
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
                    <button
                        className={`settings-tab ${activeTab === 'tpe' ? 'settings-tab--active' : ''}`}
                        onClick={() => setActiveTab('tpe')}
                        type="button"
                    >
                        <CardIcon size={18} className="inline mr-2" /> TPE
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

                    {/* TPE Tab */}
                    {activeTab === 'tpe' && (
                        <div className="settings-panel">
                            <div className="settings-panel__header">
                                <CardIcon size={24} />
                                <div>
                                    <h3>Terminal de Paiement Électronique</h3>
                                    <span>Configuration des TPE (Concert V2)</span>
                                </div>
                            </div>
                            <div className="settings-panel__content">
                                {/* Active TPE Selector */}
                                <div className="settings-form__group">
                                    <label className="settings-form__label">TPE Actif</label>
                                    <select
                                        className="settings-form__select"
                                        value={tpeConfig.activeDeviceIndex}
                                        onChange={(e) => setTpeConfig(prev => ({
                                            ...prev,
                                            activeDeviceIndex: Number(e.target.value) as 0 | 1
                                        }))}
                                    >
                                        <option value={0}>{tpeConfig.devices[0].name || 'TPE 1'}</option>
                                        <option value={1}>{tpeConfig.devices[1].name || 'TPE 2'}</option>
                                    </select>
                                    <p className="settings-form__help">
                                        Sélectionnez le TPE à utiliser pour les paiements par carte.
                                    </p>
                                </div>

                                {/* TPE 1 Configuration */}
                                <div className="settings-form__section">
                                    <h4 className="settings-form__section-title">
                                        🔹 TPE 1 {tpeConfig.activeDeviceIndex === 0 && '(Actif)'}
                                    </h4>
                                    <div className="settings-form__row">
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Nom</label>
                                            <input
                                                type="text"
                                                className="settings-form__input"
                                                value={tpeConfig.devices[0].name}
                                                onChange={(e) => updateTpeDevice(0, { name: e.target.value })}
                                                placeholder="Ex: Ingenico Move/5000"
                                            />
                                        </div>
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Connexion</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                                <select
                                                    className="settings-form__select"
                                                    value={ports.some(p => p.name === tpeConfig.devices[0].port) ? tpeConfig.devices[0].port : 'ip'}
                                                    onChange={(e) => {
                                                        if (e.target.value === 'ip') {
                                                            // Default IP placeholder only if empty or serial
                                                            if (ports.some(p => p.name === tpeConfig.devices[0].port) || !tpeConfig.devices[0].port) {
                                                                updateTpeDevice(0, { port: '192.168.1.50:8888' });
                                                            }
                                                        } else {
                                                            updateTpeDevice(0, { port: e.target.value });
                                                        }
                                                    }}
                                                >
                                                    <option value="" disabled>Sélectionner...</option>
                                                    {ports.map(p => (
                                                        <option key={p.name} value={p.name}>
                                                            {p.name} ({p.port_type})
                                                        </option>
                                                    ))}
                                                    <option value="ip">🌐 Réseau (WiFi/Ethernet)</option>
                                                </select>

                                                {!ports.some(p => p.name === tpeConfig.devices[0].port) && (
                                                    <input
                                                        type="text"
                                                        className="settings-form__input"
                                                        value={tpeConfig.devices[0].port}
                                                        onChange={(e) => updateTpeDevice(0, { port: e.target.value })}
                                                        placeholder="IP:PORT (ex: 192.168.1.50:8888)"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="settings-form__row">
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Bauds</label>
                                            <select
                                                className="settings-form__select"
                                                value={tpeConfig.devices[0].baudRate}
                                                onChange={(e) => updateTpeDevice(0, { baudRate: Number(e.target.value) })}
                                            >
                                                {BAUD_RATES.map(br => (
                                                    <option key={br} value={br}>{br}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">N° Poste</label>
                                            <input
                                                type="text"
                                                className="settings-form__input"
                                                value={tpeConfig.devices[0].posNumber}
                                                onChange={(e) => updateTpeDevice(0, { posNumber: e.target.value.slice(0, 2) })}
                                                placeholder="01"
                                                maxLength={2}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <Button onClick={() => handleTestTpe(0)} disabled={isTpeTesting === 0}>
                                            {isTpeTesting === 0 ? (
                                                <><RefreshIcon size={16} className="mr-2 animate-spin" /> Test en cours...</>
                                            ) : (
                                                <><CheckIcon size={16} className="mr-2" /> Tester connexion</>
                                            )}
                                        </Button>
                                        <Button onClick={() => handleTestPayment(0)} disabled={isTpeTesting === 0} variant="secondary">
                                            <CardIcon size={16} className="mr-2" /> Test paiement (1c)
                                        </Button>
                                    </div>
                                    {tpeTestResult && tpeTestResult.deviceIndex === 0 && (
                                        <div className={`settings-alert settings-alert--${tpeTestResult.type}`} style={{ marginTop: '10px' }}>
                                            {tpeTestResult.type === 'success' ? <CheckIcon size={16} /> : <XIcon size={16} />}
                                            <span style={{ marginLeft: '8px' }}>{tpeTestResult.message}</span>
                                        </div>
                                    )}
                                </div>

                                {/* TPE 2 Configuration */}
                                <div className="settings-form__section" style={{ marginTop: '24px' }}>
                                    <h4 className="settings-form__section-title">
                                        🔸 TPE 2 {tpeConfig.activeDeviceIndex === 1 && '(Actif)'}
                                    </h4>
                                    <div className="settings-form__row">
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Nom</label>
                                            <input
                                                type="text"
                                                className="settings-form__input"
                                                value={tpeConfig.devices[1].name}
                                                onChange={(e) => updateTpeDevice(1, { name: e.target.value })}
                                                placeholder="Ex: PAX A920 Pro"
                                            />
                                        </div>
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Connexion</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                                <select
                                                    className="settings-form__select"
                                                    value={ports.some(p => p.name === tpeConfig.devices[1].port) ? tpeConfig.devices[1].port : 'ip'}
                                                    onChange={(e) => {
                                                        if (e.target.value === 'ip') {
                                                            if (ports.some(p => p.name === tpeConfig.devices[1].port) || !tpeConfig.devices[1].port) {
                                                                updateTpeDevice(1, { port: '192.168.1.50:8888' });
                                                            }
                                                        } else {
                                                            updateTpeDevice(1, { port: e.target.value });
                                                        }
                                                    }}
                                                >
                                                    <option value="" disabled>Sélectionner...</option>
                                                    {ports.map(p => (
                                                        <option key={p.name} value={p.name}>
                                                            {p.name} ({p.port_type})
                                                        </option>
                                                    ))}
                                                    <option value="ip">🌐 Réseau (WiFi/Ethernet)</option>
                                                </select>

                                                {!ports.some(p => p.name === tpeConfig.devices[1].port) && (
                                                    <input
                                                        type="text"
                                                        className="settings-form__input"
                                                        value={tpeConfig.devices[1].port}
                                                        onChange={(e) => updateTpeDevice(1, { port: e.target.value })}
                                                        placeholder="IP:PORT (ex: 192.168.1.51:8888)"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="settings-form__row">
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">Bauds</label>
                                            <select
                                                className="settings-form__select"
                                                value={tpeConfig.devices[1].baudRate}
                                                onChange={(e) => updateTpeDevice(1, { baudRate: Number(e.target.value) })}
                                            >
                                                {BAUD_RATES.map(br => (
                                                    <option key={br} value={br}>{br}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="settings-form__group">
                                            <label className="settings-form__label">N° Poste</label>
                                            <input
                                                type="text"
                                                className="settings-form__input"
                                                value={tpeConfig.devices[1].posNumber}
                                                onChange={(e) => updateTpeDevice(1, { posNumber: e.target.value.slice(0, 2) })}
                                                placeholder="01"
                                                maxLength={2}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <Button onClick={() => handleTestTpe(1)} disabled={isTpeTesting === 1}>
                                            {isTpeTesting === 1 ? (
                                                <><RefreshIcon size={16} className="mr-2 animate-spin" /> Test en cours...</>
                                            ) : (
                                                <><CheckIcon size={16} className="mr-2" /> Tester connexion</>
                                            )}
                                        </Button>
                                        <Button onClick={() => handleTestPayment(1)} disabled={isTpeTesting === 1} variant="secondary">
                                            <CardIcon size={16} className="mr-2" /> Test paiement (1c)
                                        </Button>
                                    </div>
                                    {tpeTestResult && tpeTestResult.deviceIndex === 1 && (
                                        <div className={`settings-alert settings-alert--${tpeTestResult.type}`} style={{ marginTop: '10px' }}>
                                            {tpeTestResult.type === 'success' ? <CheckIcon size={16} /> : <XIcon size={16} />}
                                            <span style={{ marginLeft: '8px' }}>{tpeTestResult.message}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="settings-form__info" style={{ marginTop: '24px' }}>
                                    <p>
                                        <LightbulbIcon size={16} className="inline mr-2" />
                                        Les deux TPE sont configurés avec le protocole <strong>Concert V2</strong>.
                                        Vous pouvez basculer entre les deux à tout moment via le sélecteur ci-dessus.
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
