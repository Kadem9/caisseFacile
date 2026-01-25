import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../services/api';
import { Button } from '../components/ui';

interface ActivityItem {
    type: 'OUVERTURE' | 'CLOTURE' | 'ENTREE' | 'SORTIE';
    date: string;
    user_name: string; // From JOIN
    amount: number;
    reason: string;
    device_name?: string;
    local_id: number;
}

export const ActivityPage: React.FC = () => {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterDevice, setFilterDevice] = useState('');
    const [filterUser, setFilterUser] = useState('');

    const fetchActivity = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/api/activity`);
            if (!res.ok) throw new Error('Failed to fetch activity');
            const data = await res.json();
            setItems(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();
    }, []);

    // Filter Logic
    const filteredItems = items.filter(item => {
        if (filterDevice && (!item.device_name || !item.device_name.toLowerCase().includes(filterDevice.toLowerCase()))) return false;
        if (filterUser && (!item.user_name || !item.user_name.toLowerCase().includes(filterUser.toLowerCase()))) return false;
        return true;
    });

    // Unique devices/users for dropdowns (optional, but text search is easier for now)

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Journal de Caisse</h1>
                    <p className="text-slate-500">Historique des sessions, mouvements et clôtures</p>
                </div>
                <Button onClick={fetchActivity} variant="secondary">Actualiser</Button>
            </header>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filtrer par Caisse</label>
                    <input
                        type="text"
                        placeholder="ex: Caisse Bar"
                        className="w-full p-2 border rounded-lg"
                        value={filterDevice}
                        onChange={e => setFilterDevice(e.target.value)}
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filtrer par Utilisateur</label>
                    <input
                        type="text"
                        placeholder="ex: Marie"
                        className="w-full p-2 border rounded-lg"
                        value={filterUser}
                        onChange={e => setFilterUser(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">Chargement...</div>
            ) : error ? (
                <div className="text-center py-12 text-red-500">{error}</div>
            ) : (
                <div className="space-y-4">
                    {filteredItems.map((item, idx) => {
                        const date = new Date(item.date);
                        const isToday = date.toDateString() === new Date().toDateString();

                        let typeColor = 'bg-slate-100 text-slate-800';
                        let icon = '•';
                        if (item.type === 'OUVERTURE') {
                            typeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                            icon = '🔓';
                        } else if (item.type === 'CLOTURE') {
                            typeColor = 'bg-red-100 text-red-800 border-red-200';
                            icon = '🔒';
                        } else if (item.type === 'ENTREE') {
                            typeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                            icon = '⬇️';
                        } else if (item.type === 'SORTIE') {
                            typeColor = 'bg-orange-100 text-orange-800 border-orange-200';
                            icon = '⬆️';
                        }

                        return (
                            <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${typeColor.split(' ')[0]}`}>
                                    {icon}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${typeColor}`}>{item.type}</span>
                                                <span className="font-semibold text-slate-800">
                                                    {item.type === 'OUVERTURE' && `Ouverture par ${item.user_name}`}
                                                    {item.type === 'CLOTURE' && `Clôture par ${item.user_name}`}
                                                    {item.type === 'ENTREE' && `Entrée par ${item.user_name}`}
                                                    {item.type === 'SORTIE' && `Sortie par ${item.user_name}`}
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-500 mt-1">
                                                {item.device_name ? (
                                                    <span className="font-medium text-slate-700 mr-2">🖥️ {item.device_name}</span>
                                                ) : <span className="mr-2">🖥️ Poste Local</span>}
                                                {item.reason && <span className="italic">"{item.reason}"</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-slate-900">
                                                {item.amount?.toFixed(2).replace('.', ',')} €
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {date.toLocaleDateString()} {date.toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredItems.length === 0 && (
                        <div className="text-center py-12 text-slate-400">Aucune activité trouvée</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ActivityPage;
