import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import type { CashClosureWithDetails } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const generateClosurePDF = async (closure: CashClosureWithDetails, products: any[] = [], categories: any[] = []): Promise<string> => {
    const doc = new jsPDF();
    const margin = 15;

    // --- Header ---
    doc.setFontSize(22);
    doc.text('Rapport de Clôture de Caisse', margin, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateStr = format(new Date(closure.closedAt || new Date()), 'dd MMMM yyyy à HH:mm', { locale: fr });
    doc.text(`Généré le: ${dateStr}`, margin, 27);
    doc.text(`Vendeur: ${closure.user?.name || 'Inconnu'}`, margin, 32);

    let yPos = 45;

    // --- Financial Summary ---
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Synthèse Financière', margin, yPos);
    yPos += 5;

    const summaryData = [
        ['Fond de Caisse Initial', `${closure.initialAmount?.toFixed(2)} €`],
        ['Total Ventes (CA)', `${(closure.expectedAmount - (closure.initialAmount || 0)).toFixed(2)} €`],
        ['Total Espèces (Théorique)', `${closure.expectedAmount.toFixed(2)} €`],
        ['Total Espèces (Compté)', `${closure.actualAmount?.toFixed(2)} €`],
        ['Différence', {
            content: `${closure.difference?.toFixed(2)} €`,
            styles: {
                textColor: (closure.difference || 0) < 0 ? [239, 68, 68] : [22, 163, 74],
                fontStyle: 'bold'
            }
        }]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Intitulé', 'Montant']],
        body: summaryData as any,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 11 },
        columnStyles: {
            0: { cellWidth: 100 },
            1: { halign: 'right', fontStyle: 'bold' }
        }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- Payment Breakdown ---
    doc.setFontSize(14);
    doc.text('Répartition des Paiements', margin, yPos);
    yPos += 5;

    let totalCash = 0;
    let totalCard = 0;

    closure.transactions.forEach(t => {
        if (t.paymentMethod === 'cash') totalCash += t.totalAmount;
        else if (t.paymentMethod === 'card') totalCard += t.totalAmount;
        else if (t.paymentMethod === 'mixed') {
            const cashPart = t.cashReceived || 0;
            const change = t.changeGiven || 0;
            const effectiveCash = Math.max(0, cashPart - change);
            totalCash += effectiveCash;
            // Card part is total - effectiveCash
            totalCard += (t.totalAmount - effectiveCash);
        }
    });

    const paymentData = [
        ['Espèces', `${totalCash.toFixed(2)} €`],
        ['Carte Bancaire', `${totalCard.toFixed(2)} €`],
        ['TOTAL', `${(totalCash + totalCard).toFixed(2)} €`]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Moyen de Paiement', 'Total']],
        body: paymentData,
        theme: 'grid',
        headStyles: { fillColor: [46, 204, 113] },
        columnStyles: { 1: { halign: 'right' } }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- Sales by Category (Families) ---
    doc.setFontSize(14);
    doc.text('Ventes par Famille', margin, yPos);
    yPos += 5;

    const catSales = new Map<number, { name: string, qty: number, total: number }>();
    const prodSales = new Map<number, { name: string, qty: number, total: number }>();

    // Determine category names map
    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const prodMap = new Map(products.map(p => [p.id, p]));

    closure.transactions.forEach(t => {
        t.items.forEach((item: any) => {
            const prod = prodMap.get(item.productId);
            // Categories
            const catId = prod ? prod.categoryId : 0;
            const catName = catMap.get(catId) || 'Inconnu';

            if (!catSales.has(catId)) catSales.set(catId, { name: catName, qty: 0, total: 0 });
            const c = catSales.get(catId)!;
            c.qty += item.quantity;
            c.total += item.subtotal;

            // Products
            const prodName = prod ? prod.name : `Produit #${item.productId}`;
            if (!prodSales.has(item.productId)) prodSales.set(item.productId, { name: prodName, qty: 0, total: 0 });
            const p = prodSales.get(item.productId)!;
            p.qty += item.quantity;
            p.total += item.subtotal;
        });
    });

    const catData = Array.from(catSales.values()).map(c => [
        c.name,
        c.qty.toString(),
        `${c.total.toFixed(2)} €`
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [['Famille', 'Qté', 'Total']],
        body: catData,
        theme: 'striped',
        headStyles: { fillColor: [142, 68, 173] },
        columnStyles: { 2: { halign: 'right' } }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- Sales by Product ---
    doc.setFontSize(14);
    doc.text('Ventes par Produit', margin, yPos);
    yPos += 5;

    const prodData = Array.from(prodSales.values())
        .sort((a, b) => b.qty - a.qty) // Sort by popularity
        .map(p => [
            p.name,
            p.qty.toString(),
            `${p.total.toFixed(2)} €`
        ]);

    autoTable(doc, {
        startY: yPos,
        head: [['Produit', 'Qté', 'Total']],
        body: prodData,
        theme: 'striped',
        headStyles: { fillColor: [230, 126, 34] },
        columnStyles: { 2: { halign: 'right' } }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- Cash Movements ---
    if (closure.movements && closure.movements.length > 0) {
        doc.setFontSize(14);
        doc.text('Mouvements de Caisse', margin, yPos);
        yPos += 5;

        const movementsData = closure.movements.map(m => [
            format(new Date(m.createdAt), 'HH:mm'),
            m.type === 'withdrawal' ? 'Sortie' : 'Entrée',
            m.reason,
            `${m.amount.toFixed(2)} €`
        ]);

        autoTable(doc, {
            startY: yPos,
            head: [['Heure', 'Type', 'Raison', 'Montant']],
            body: movementsData as any,
            theme: 'plain',
            styles: { fontSize: 9 },
            columnStyles: { 3: { halign: 'right' } }
        });

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 15;
    }

    // --- Transaction History ---
    doc.setFontSize(14);
    doc.text('Détail des Transactions', margin, yPos);
    yPos += 5;

    const txData = closure.transactions.map(t => [
        format(new Date(t.createdAt), 'HH:mm'),
        `#${t.id}`,
        t.paymentMethod === 'mixed' ? 'Mixte' : (t.paymentMethod === 'card' ? 'CB' : 'Esp'),
        `${t.totalAmount.toFixed(2)} €`
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [['Heure', 'ID', 'Méthode', 'Montant']],
        body: txData,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 73, 94] },
        columnStyles: { 3: { halign: 'right' } }
    });

    // --- Save File ---
    const fileName = `Cloture_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`;

    try {
        // Get Documents path
        const docPath = await documentDir();
        const closuresDir = await join(docPath, 'Closures');
        const filePath = await join(closuresDir, fileName);

        // Create directory if not exists
        try {
            await mkdir(closuresDir, { recursive: true });
        } catch (e) {
            // Ignore if exists
        }

        // Correct approach for FS v2:
        // We need to use `mkdir` from plugin-fs

        const pdfArrayBuffer = doc.output('arraybuffer');
        await writeFile(filePath, new Uint8Array(pdfArrayBuffer));

        return filePath;
    } catch (error) {
        console.error('Error saving PDF', error);
        throw error;
    }
};
