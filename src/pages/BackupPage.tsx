// ===================================
// Backup Page - Data Export & Backup Interface
// ===================================

import React, { useState, useCallback } from 'react';
import {
    Button,
    DownloadIcon,
    FileIcon,
    HistoryIcon,
    CheckIcon,
    InfoIcon,
    AlertIcon,
    SyncIcon
} from '../components/ui';
import {
    useTransactionStore,
    useProductStore,
    useMenuStore,
    useSyncStore
} from '../stores';
import {
    exportTransactionsToCSV,
    downloadCSV,
    exportAllToJSON,
    downloadJSON
} from '../utils/export';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './BackupPage.css';

export const BackupPage: React.FC = () => {
    const { transactions } = useTransactionStore();
    const { products, categories } = useProductStore();
    const { menus } = useMenuStore();
    const { queue } = useSyncStore();

    const [isExporting, setIsExporting] = useState(false);
    const [lastExport, setLastExport] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    }, []);


    // Format current date for filenames
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const displayDate = format(new Date(), 'dd MMMM yyyy', { locale: fr });

    // Filter today's transactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTransactions = transactions.filter(t => new Date(t.createdAt) >= today);

    // Aggregations for Reports
    const productStats = useCallback(() => {
        const stats: Record<number, {
            name: string;
            qty: number;
            total: number;
            cashQty: number;
            cardQty: number;
            categoryId: number
        }> = {};

        todayTransactions.forEach(t => {
            const items = Array.isArray(t.items) ? t.items : [];
            items.forEach(item => {
                const pId = item.productId;
                if (!stats[pId]) {
                    const product = products.find(p => p.id === pId);
                    stats[pId] = {
                        name: product?.name || `Produit #${pId}`,
                        qty: 0,
                        total: 0,
                        cashQty: 0,
                        cardQty: 0,
                        categoryId: product?.categoryId || 0
                    };
                }
                stats[pId].qty += item.quantity;
                stats[pId].total += (item.unitPrice || 0) * item.quantity;
                if (t.paymentMethod === 'cash') stats[pId].cashQty += item.quantity;
                else if (t.paymentMethod === 'card') stats[pId].cardQty += item.quantity;
            });
        });

        return Object.values(stats).sort((a, b) => b.total - a.total);
    }, [todayTransactions, products])();

    const catStats = useCallback(() => {
        const stats: Record<number, { name: string; total: number }> = {};

        productStats.forEach(ps => {
            if (!stats[ps.categoryId]) {
                const cat = categories.find(c => c.id === ps.categoryId);
                stats[ps.categoryId] = {
                    name: cat?.name || 'Sans catégorie',
                    total: 0
                };
            }
            stats[ps.categoryId].total += ps.total;
        });

        return Object.values(stats).sort((a, b) => b.total - a.total);
    }, [productStats, categories])();

    const handleExportCSV = useCallback(() => {
        setIsExporting(true);
        try {
            const csv = exportTransactionsToCSV(todayTransactions);
            downloadCSV(csv, `transactions_caissier_${dateStr}.csv`);
            setLastExport(`CSV (${todayTransactions.length} lignes)`);
            showNotification('Le fichier CSV a été enregistré dans votre dossier Téléchargements.');
        } catch (err) {
            console.error('Export CSV failed:', err);
            showNotification('Erreur lors de l\'export CSV', 'error');
        } finally {
            setIsExporting(false);
        }
    }, [todayTransactions, dateStr, showNotification]);

    const handleExportJSON = useCallback(() => {
        setIsExporting(true);
        try {
            const data = {
                products,
                categories,
                transactions,
                menus,
                stockMovements: [], // Added placeholder to match ExportData type
                closures: [], // Added placeholder to match ExportData type
            };
            const json = exportAllToJSON(data);
            downloadJSON(json, `sauvegarde_complete_${dateStr}.json`);
            setLastExport('Sauvegarde JSON Complète');
            showNotification('La sauvegarde complète (JSON) a été enregistrée dans vos Téléchargements.');
        } catch (err) {
            console.error('Export JSON failed:', err);
            showNotification('Erreur lors de l\'export JSON', 'error');
        } finally {
            setIsExporting(false);
        }
    }, [products, categories, transactions, menus, dateStr, showNotification]);

    const handleExportPDF = useCallback(() => {
        setIsExporting(true);
        try {
            const doc = new jsPDF();

            // Header
            doc.setFontSize(22);
            doc.setTextColor(30, 41, 59);
            doc.text('Récapitulatif Journalier - AS Manissieux', 105, 20, { align: 'center' });

            doc.setFontSize(12);
            doc.setTextColor(100, 116, 139);
            doc.text(`Généré le: ${displayDate}`, 105, 30, { align: 'center' });

            // 1. Statistics Summary
            const totalAmount = todayTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
            const cashAmount = todayTransactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
            const cardAmount = todayTransactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);

            doc.setFontSize(16);
            doc.setTextColor(15, 23, 42);
            doc.text('Synthèse Financière', 20, 45);

            autoTable(doc, {
                startY: 50,
                head: [['Désignation', 'Valeur']],
                body: [
                    ['Chiffre d\'Affaires Total', `${totalAmount.toFixed(2).replace('.', ',')} €`],
                    ['Nombre de Transactions', `${todayTransactions.length}`],
                    ['Total Espèces', `${cashAmount.toFixed(2).replace('.', ',')} €`],
                    ['Total Carte Bancaire', `${cardAmount.toFixed(2).replace('.', ',')} €`],
                ],
                theme: 'striped',
                headStyles: { fillColor: [71, 85, 105] },
            });

            // 2. Category Summary
            doc.text('Ventes par Catégorie', 20, (doc as any).lastAutoTable.finalY + 15);
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 20,
                head: [['Catégorie', 'Montant Total']],
                body: catStats.map(c => [c.name, `${c.total.toFixed(2).replace('.', ',')} €`]),
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235] },
            });

            // 3. Product Detail
            doc.text('Détail par Produit', 20, (doc as any).lastAutoTable.finalY + 15);
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 20,
                head: [['Produit', 'Qté', 'Espèces', 'Carte', 'Total']],
                body: productStats.map(p => [
                    p.name,
                    p.qty.toString(),
                    p.cashQty.toString(),
                    p.cardQty.toString(),
                    `${p.total.toFixed(2).replace('.', ',')} €`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [5, 150, 105] },
            });

            // 4. Transactions List (New Page if needed)
            if ((doc as any).lastAutoTable.finalY > 200) doc.addPage();
            doc.text('Journal des Transactions', 20, (doc as any).lastAutoTable.finalY + 15);

            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 20,
                head: [['ID', 'Heure', 'Montant', 'Mode']],
                body: todayTransactions.map(t => [
                    `#${t.id}`,
                    format(new Date(t.createdAt), 'HH:mm'),
                    `${t.totalAmount.toFixed(2).replace('.', ',')} €`,
                    t.paymentMethod === 'cash' ? 'Espèces' : 'Carte'
                ]),
                theme: 'grid',
                headStyles: { fillColor: [71, 85, 105] },
            });

            doc.save(`recap_journalier_${dateStr}.pdf`);
            setLastExport('Rapport PDF détaillé');
            showNotification('Le rapport PDF a été généré et enregistré dans votre dossier Téléchargements.');
        } catch (err) {
            console.error('Export PDF failed:', err);
            showNotification('Erreur lors de l\'export PDF', 'error');
        } finally {
            setIsExporting(false);
        }
    }, [todayTransactions, dateStr, displayDate, productStats, catStats, showNotification]);

    return (
        <div className="backup-page">
            {notification && (
                <div className={`backup-notification backup-notification--${notification.type}`}>
                    <CheckIcon size={20} />
                    <span>{notification.message}</span>
                </div>
            )}
            <header className="backup-header">
                <div className="backup-title">
                    <h1>Sauvegarde & Exports</h1>
                    <p>{todayTransactions.length} transaction{todayTransactions.length > 1 ? 's' : ''} aujourd'hui</p>
                </div>
            </header>

            <main className="backup-content">
                <div className="backup-grid">
                    {/* Daily Exports */}
                    <section className="backup-section">
                        <div className="backup-section__header">
                            <HistoryIcon size={24} color="#3b82f6" />
                            <h2>Export du Jour</h2>
                        </div>
                        <p className="backup-section__desc">
                            Générez les rapports détaillés de l'activité d'aujourd'hui.
                        </p>
                        <div className="backup-actions">
                            <Button variant="primary" onClick={handleExportPDF} disabled={isExporting}>
                                <FileIcon size={20} />
                                <span>Rapport PDF (.pdf)</span>
                            </Button>
                            <Button variant="secondary" onClick={handleExportCSV} disabled={isExporting}>
                                <DownloadIcon size={20} />
                                <span>Transactions CSV (.csv)</span>
                            </Button>
                        </div>
                        <div className="backup-stats-mini">
                            <div className="mini-stat">
                                <span className="label">Aujourd'hui :</span>
                                <span className="value">{todayTransactions.length} ventes</span>
                            </div>
                        </div>
                    </section>

                    {/* System Backup */}
                    <section className="backup-section">
                        <div className="backup-section__header">
                            <SyncIcon size={24} color="#10b981" />
                            <h2>Sauvegarde Système</h2>
                        </div>
                        <p className="backup-section__desc">
                            Sauvegardez l'intégralité des données (produits, config, historique).
                        </p>
                        <div className="backup-actions">
                            <Button variant="secondary" onClick={handleExportJSON} disabled={isExporting} isFullWidth>
                                <CheckIcon size={20} />
                                <span>Sauvegarde Complète (.json)</span>
                            </Button>
                        </div>
                        {queue.length > 0 && (
                            <div className="backup-alert backup-alert--warning">
                                <AlertIcon size={18} />
                                <span>Attention: {queue.length} éléments sont en attente de synchronisation sur le serveur.</span>
                            </div>
                        )}
                    </section>
                </div>

                {/* Status Indicator */}
                <div className="backup-status">
                    <div className="backup-status__info">
                        <InfoIcon size={18} />
                        <span>Les fichiers sont enregistrés dans votre dossier Téléchargements.</span>
                    </div>
                    {lastExport && (
                        <div className="backup-last-action">
                            Dernière action : <strong>{lastExport}</strong> (à {format(new Date(), 'HH:mm')})
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default BackupPage;
