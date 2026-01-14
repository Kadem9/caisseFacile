// ===================================
// Splash Screen Component
// ===================================

import React, { useEffect, useState } from 'react';
import './SplashScreen.css';
import logoImg from '../../assets/logo-asmsp.png';

// Funny quotes related to football/bar
const QUOTES = [
    "Chargement des saucisses...",
    "Échauffement de la tireuse...",
    "Vérification des crampons...",
    "Gonflage des ballons en cours...",
    "L'arbitre consulte la VAR...",
    "On prépare la monnaie de 2€...",
    "Les frites sont bientôt prêtes...",
    "Tactique du 4-4-2 en chargement...",
    "Calcul de la trajectoire du coup franc...",
    "Hydratation des joueurs...",
    "Le gardien met ses gants...",
    "Les supporters arrivent...",
    "La mi-temps approche...",
    "Analyse du hors-jeu...",
    "Négociation du prix du ketchup...",
    "Mise en place du mur...",
    "Nettoyage des poteaux...",
    "Vérification de la pression du fût...",
    "Le coach donne ses consignes...",
    "Remplacement tactique en cours...",
    "Tonte de la pelouse...",
    "Cuisson des merguez à point...",
    "Recherche du sifflet de l'arbitre...",
    "Les citrons sont coupés...",
    "échauffement du décapsuleur...",
    "La troisième mi-temps se prépare...",
    "Calcul du temps additionnel...",
    "Étirement des ischio-jambiers...",
    "La ola démarre...",
    "Vérification des stocks de bonbons...",
    "Le 12ème homme se réveille...",
    "Commande de glaçons en cours...",
    "Installation des filets...",
];

interface SplashScreenProps {
    onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const [quote, setQuote] = useState('');
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        // Pick a random quote
        setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

        // Start fade out sequence
        const fadeTimer = setTimeout(() => {
            setIsFading(true);
        }, 2500); // Show for 2.5s

        // Complete sequence
        const finishTimer = setTimeout(() => {
            onFinish();
        }, 3000); // +0.5s for fade animation

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(finishTimer);
        };
    }, [onFinish]);

    return (
        <div className={`splash-screen ${isFading ? 'splash-screen--fading' : ''}`}>
            <div className="splash-screen__content">
                <div className="splash-screen__logo">
                    {/* Try to load standard logo, fallback to emoji if fail */}
                    <img
                        src={logoImg}
                        alt="Logo"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = '⚽';
                        }}
                    />
                </div>

                <h1 className="splash-screen__title">
                    AS Manissieux<br />Caisse
                </h1>

                <p className="splash-screen__quote">
                    "{quote}"
                </p>

                <div className="splash-screen__loader"></div>
            </div>
        </div>
    );
};
