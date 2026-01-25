import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { writeFile, BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import { Transaction } from '../types';
import { logger } from '../services/logger';

export async function generateAndSaveDailyReport(transactions: Transaction[]): Promise<string> {
    try {
        const doc = new jsPDF();
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR');
        const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

        // Filter transactions for today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const dayTransactions = transactions.filter(t => {
            const tDate = new Date(t.createdAt);
            return tDate >= startOfDay && tDate <= endOfDay;
        });

        // Calculate stats
        const totalSales = dayTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const cashSales = dayTransactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
        const cardSales = dayTransactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);

        const formatPrice = (p: number) => p.toFixed(2).replace('.', ',') + ' €';

        // --- PDF Generation ---

        // Header
        doc.setFontSize(22);
        doc.setTextColor(245, 200, 0); // #F5C800
        doc.text("AS Manissieux", 105, 20, { align: "center" });

        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.text("Sauvegarde Automatique - Journal de Caisse", 105, 30, { align: "center" });
        doc.text(`Date : ${dateStr} à ${timeStr}`, 105, 38, { align: "center" });

        // Stats Section
        doc.setFontSize(16);
        doc.setTextColor(0);
        doc.text("Résumé de la journée (Provisoire)", 14, 55);

        doc.setFontSize(12);
        doc.text(`Chiffre d'affaires : ${formatPrice(totalSales)}`, 14, 65);
        doc.text(`Espèces : ${formatPrice(cashSales)}`, 14, 72);
        doc.text(`CB : ${formatPrice(cardSales)}`, 14, 79);
        doc.text(`Transactions : ${dayTransactions.length}`, 14, 86);

        // Transactions Table
        autoTable(doc, {
            startY: 95,
            head: [['Heure', 'Montant', 'Paiement', 'Rendu']],
            body: dayTransactions.map(t => [
                new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                formatPrice(t.totalAmount),
                t.paymentMethod === 'cash' ? 'Espèces' : t.paymentMethod === 'card' ? 'CB' : 'Mixte',
                t.changeGiven ? formatPrice(t.changeGiven) : '-'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [40, 40, 40] },
            styles: { fontSize: 10 },
        });

        // Footer
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`Sauvegarde auto - ${dateStr} - Page ${i}/${pageCount}`, 105, 290, { align: "center" });
        }

        // --- File Saving with Fallback ---
        const pdfOutput = doc.output('arraybuffer');
        const fileName = `Backup_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}.pdf`;
        const dirName = 'Backups';

        // Helper to try saving in a specific directory
        const trySave = async (baseDir: BaseDirectory, locationName: string) => {
            try {
                const existsDir = await exists(dirName, { baseDir });
                if (!existsDir) {
                    await mkdir(dirName, { baseDir, recursive: true });
                }
                const filePath = `${dirName}/${fileName}`;
                await writeFile(filePath, new Uint8Array(pdfOutput), { baseDir });
                await logger.info(`Backup saved successfully to ${locationName}: ${filePath}`);
                return filePath;
            } catch (err: any) {
                console.warn(`Failed to save to ${locationName}:`, err);
                throw new Error(`Échec ${locationName}: ${err?.message || err}`);
            }
        };

        try {
            // Priority 1: Documents
            return await trySave(BaseDirectory.Document, 'Documents');
        } catch (docError) {
            console.warn("Primary backup failed, trying fallback...", docError);
            try {
                // Priority 2: AppLocalData (Application Support)
                return await trySave(BaseDirectory.AppLocalData, 'AppLocalData');
            } catch (appDataError) {
                // Throw combined error if both fail
                throw new Error(`Backup failed in both locations. Doc: ${docError instanceof Error ? docError.message : docError}, AppData: ${appDataError instanceof Error ? appDataError.message : appDataError}`);
            }
        }

    } catch (error) {
        console.error("Auto backup failed fatal:", error);
        await logger.error("Auto backup failed fatal", error);
        throw error;
    }
}
