import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import './TicketPreview.css';

interface TicketPreviewProps {
    productName: string;
    sellerName: string;
    date: Date;
    ticketNumber?: string;
}

export const TicketPreview: React.FC<TicketPreviewProps> = ({
    productName,
    sellerName,
    date,
    ticketNumber
}) => {
    return (
        <div className="ticket-preview">
            <div className="ticket-preview__header">
                <span className="ticket-preview__brand">AS MANISSIEUX</span>
            </div>

            <div className="ticket-preview__body">
                <h2 className="ticket-preview__product">{productName}</h2>

                <div className="ticket-preview__details">
                    <div className="ticket-preview__row">
                        <span className="ticket-preview__label">Date</span>
                        <span className="ticket-preview__value">
                            {format(date, 'dd/MM/yyyy HH:mm', { locale: fr })}
                        </span>
                    </div>

                    <div className="ticket-preview__row">
                        <span className="ticket-preview__label">Vendeur</span>
                        <span className="ticket-preview__value">{sellerName}</span>
                    </div>

                    {ticketNumber && (
                        <div className="ticket-preview__row">
                            <span className="ticket-preview__label">N°</span>
                            <span className="ticket-preview__value">#{ticketNumber}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="ticket-preview__footer">
                <div className="ticket-preview__barcode">
                    {/* Fake barcode bars */}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                height: '100%',
                                width: Math.random() > 0.5 ? '2px' : '4px',
                                background: 'black',
                                opacity: 0.8
                            }}
                        />
                    ))}
                </div>
                <span className="ticket-preview__notice">Ticket de retrait</span>
            </div>
        </div>
    );
};
