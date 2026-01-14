import React from 'react';
import { Button, XIcon, PrinterIcon } from '../ui';
import { TicketPreview } from './TicketPreview';
import type { CartItem } from '../../types';
import './TicketsModal.css';

interface TicketsModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    sellerName: string;
    date: Date;
}

export const TicketsModal: React.FC<TicketsModalProps> = ({
    isOpen,
    onClose,
    items,
    sellerName,
    date
}) => {
    if (!isOpen) return null;

    // Expand cart items into individual tickets (quantity > 1 means multiple tickets)
    const allTickets = items.flatMap(item =>
        Array.from({ length: item.quantity }).map((_, idx) => ({
            ...item,
            uniqueId: `${item.product.id}-${idx}`
        }))
    );

    return (
        <div className="tickets-modal-overlay">
            <div className="tickets-modal">
                <div className="tickets-modal__header">
                    <h2>Prévisualisation des Tickets ({allTickets.length})</h2>
                    <button className="tickets-modal__close" onClick={onClose}>
                        <XIcon size={24} />
                    </button>
                </div>

                <div className="tickets-modal__content">
                    <div className="tickets-list">
                        {allTickets.map((ticket, index) => (
                            <TicketPreview
                                key={`${ticket.product.id}-${index}`}
                                productName={ticket.product.name}
                                sellerName={sellerName}
                                date={date}
                                ticketNumber={`${Math.floor(Date.now() / 1000)}-${index + 1}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="tickets-modal__footer">
                    <div className="tickets-modal__warning">
                        ⚠️ Affichage de test - Ne pas utiliser en production sans imprimante réelle
                    </div>
                    <Button variant="secondary" onClick={onClose}>
                        Fermer
                    </Button>
                    <Button variant="primary" onClick={() => window.print()}>
                        <PrinterIcon size={20} /> Imprimer (Navigateur)
                    </Button>
                </div>
            </div>
        </div>
    );
};
