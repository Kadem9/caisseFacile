import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { PackageIcon, SettingsIcon, ChartIcon, ClipboardIcon, CardIcon, BoxIcon, DownloadIcon, UserIcon } from '../components/ui';
import { useAuthStore } from '../stores';
import './AdminLayout.css';
import logoImg from '../assets/logo-asmsp.png';

export const AdminLayout: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuthStore();

    // Check if user is specialized (cashier) to restrict access
    // 'cashier' role should NOT see Stock or Catalogue (Products/Categories/Menus)
    const isCashier = currentUser?.role === 'cashier';

    return (
        <div className="admin-layout">
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="admin-sidebar__header">
                    <div className="admin-sidebar__brand">
                        <div className="admin-sidebar__logo-wrapper">
                            <img
                                src={logoImg}
                                alt="Logo"
                                className="admin-sidebar__logo-img"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.innerText = 'AG';
                                }}
                            />
                        </div>
                        <div className="admin-sidebar__app-name">
                            <h1>AS Manissieux</h1>
                            <span>Administration</span>
                        </div>
                    </div>
                </div>

                <nav className="admin-sidebar__nav">
                    <NavLink
                        to="/admin/dashboard"
                        className={({ isActive }) =>
                            `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                        }
                    >
                        <ChartIcon size={20} />
                        Tableau de bord
                    </NavLink>

                    {!isCashier && (
                        <>
                            <div className="admin-sidebar__section-title">
                                Catalogue
                            </div>

                            <NavLink
                                to="/admin/products"
                                className={({ isActive }) =>
                                    `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                                }
                            >
                                <PackageIcon size={20} />
                                Produits
                            </NavLink>

                            <NavLink
                                to="/admin/categories"
                                className={({ isActive }) =>
                                    `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                                }
                            >
                                <ClipboardIcon size={20} />
                                Familles
                            </NavLink>

                            <NavLink
                                to="/admin/menus"
                                className={({ isActive }) =>
                                    `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                                }
                            >
                                <PackageIcon size={20} />
                                Menus
                            </NavLink>

                            <div className="admin-sidebar__section-title">
                                Stocks
                            </div>

                            <NavLink
                                to="/admin/stock"
                                className={({ isActive }) =>
                                    `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                                }
                            >
                                <BoxIcon size={20} />
                                Gestion Stock
                            </NavLink>
                        </>
                    )}

                    <div className="admin-sidebar__section-title">
                        Système
                    </div>

                    <NavLink
                        to="/admin/closure"
                        className={({ isActive }) =>
                            `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                        }
                    >
                        <CardIcon size={20} />
                        Clôtures
                    </NavLink>

                    <NavLink
                        to="/admin/backup"
                        className={({ isActive }) =>
                            `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                        }
                    >
                        <DownloadIcon size={20} />
                        Sauvegarde
                    </NavLink>

                    {!isCashier && (
                        <NavLink
                            to="/admin/users"
                            className={({ isActive }) =>
                                `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                            }
                        >
                            <UserIcon size={20} />
                            Utilisateurs
                        </NavLink>
                    )}

                    <NavLink
                        to="/admin/settings"
                        className={({ isActive }) =>
                            `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                        }
                    >
                        <SettingsIcon size={20} />
                        Paramètres
                    </NavLink>
                </nav>

                <div className="admin-sidebar__footer">
                    <button
                        onClick={() => navigate('/pos')}
                        className="admin-sidebar__back-btn"
                    >
                        Retour à la Caisse
                    </button>
                    {currentUser && (
                        <div className="admin-sidebar__user">
                            <div className="admin-sidebar__user-avatar">
                                {currentUser.name.charAt(0)}
                            </div>
                            <div className="admin-sidebar__user-info">
                                <span className="name">{currentUser.name}</span>
                                <span className="role">{currentUser.role === 'admin' ? 'Administrateur' : currentUser.role === 'cashier' ? 'Vendeur' : 'Gérant'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <Outlet />
            </main>
        </div>
    );
};
