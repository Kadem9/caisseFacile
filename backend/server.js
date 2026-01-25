// ===================================
// CaisseFacile ASMSP - Backend API Server
// ===================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../src-tauri/ma_caisse.db'); // Updated DB_PATH
const uploadsPath = join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsPath);
    },
    filename: function (req, file, cb) {
        // Use timestamp + original extension to avoid name collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// ===================================
// Configuration
// ===================================

const PORT = process.env.PORT || 3001; // Kept original PORT definition

// ===================================
// Database Setup
// ===================================

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        cash_received REAL,
        change_given REAL,
        items TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id, created_at)
    );

    -- Cash closures table
    CREATE TABLE IF NOT EXISTS closures (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        initial_amount REAL DEFAULT 0,
        expected_amount REAL NOT NULL,
        actual_amount REAL,
        difference REAL,
        notes TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id, opened_at)
    );

    -- Cash movements table (deposits/withdrawals)
    CREATE TABLE IF NOT EXISTS cash_movements (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        closure_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'withdrawal', 'deposit'
        amount REAL NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (closure_id) REFERENCES closures(id) ON DELETE CASCADE,
        UNIQUE(local_id, created_at)
    );

    -- Products table (for reference/backup)
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock_quantity INTEGER NOT NULL,
        alert_threshold INTEGER NOT NULL,
        is_active INTEGER NOT NULL,
        image_path TEXT,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id)
    );

    -- Stock movements table
    CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id, created_at)
    );

    -- Menus table
    CREATE TABLE IF NOT EXISTS menus (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        image_path TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id)
    );

    -- Menu components table (e.g., "1 Boisson", "1 Accompagnement")
    CREATE TABLE IF NOT EXISTS menu_components (
        id INTEGER PRIMARY KEY,
        menu_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        is_required INTEGER DEFAULT 1,
        FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
    );

    -- Products allowed in each component
    CREATE TABLE IF NOT EXISTS menu_component_products (
        id INTEGER PRIMARY KEY,
        component_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        FOREIGN KEY (component_id) REFERENCES menu_components(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        local_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id)
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Sync log table
    CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

console.log('[Database] Initialized successfully');

// ===================================
// Seeding Initial Data
// ===================================
const checkProducts = db.prepare('SELECT count(*) as count FROM products').get();

if (checkProducts.count === 0) {
    console.log('[Database] Seeding initial products...');

    const INITIAL_PRODUCTS = [
        // Boissons
        { local_id: 1, category_id: 1, name: 'Bière 25cl', price: 3.00, stock_quantity: 100, alert_threshold: 20 },
        { local_id: 2, category_id: 1, name: 'Bière 50cl', price: 5.00, stock_quantity: 80, alert_threshold: 15 },
        { local_id: 3, category_id: 1, name: 'Coca-Cola', price: 2.50, stock_quantity: 50, alert_threshold: 10 },
        { local_id: 4, category_id: 1, name: 'Eau', price: 1.50, stock_quantity: 100, alert_threshold: 20 },
        { local_id: 5, category_id: 1, name: 'Café', price: 1.50, stock_quantity: 200, alert_threshold: 30 },
        // Snacks
        { local_id: 6, category_id: 2, name: 'Chips', price: 2.00, stock_quantity: 40, alert_threshold: 10 },
        { local_id: 7, category_id: 2, name: 'Cacahuètes', price: 2.50, stock_quantity: 30, alert_threshold: 10 },
        { local_id: 8, category_id: 2, name: 'Bonbons', price: 1.00, stock_quantity: 100, alert_threshold: 20 },
        // Repas
        { local_id: 9, category_id: 3, name: 'Hot-Dog', price: 4.00, stock_quantity: 25, alert_threshold: 5 },
        { local_id: 10, category_id: 3, name: 'Sandwich', price: 5.00, stock_quantity: 20, alert_threshold: 5 },
        { local_id: 11, category_id: 3, name: 'Frites', price: 3.00, stock_quantity: 30, alert_threshold: 10 },
        // Desserts
        { local_id: 12, category_id: 4, name: 'Gaufre', price: 3.50, stock_quantity: 15, alert_threshold: 5 },
        { local_id: 13, category_id: 4, name: 'Crêpe', price: 3.00, stock_quantity: 15, alert_threshold: 5 },
    ];

    const insertProduct = db.prepare(`
        INSERT INTO products (local_id, category_id, name, price, stock_quantity, alert_threshold, is_active, created_at, updated_at)
        VALUES (@local_id, @category_id, @name, @price, @stock_quantity, @alert_threshold, 1, @now, @now)
    `);

    const now = new Date().toISOString();
    const insertMany = db.transaction((products) => {
        for (const p of products) insertProduct.run({ ...p, now });
    });

    insertMany(INITIAL_PRODUCTS);
    console.log(`[Database] Seeded ${INITIAL_PRODUCTS.length} products.`);
}

// Seed Users
const checkUsers = db.prepare('SELECT count(*) as count FROM users').get();
if (checkUsers.count === 0) {
    console.log('[Database] Seeding initial users...');
    const INITIAL_USERS = [
        { name: 'Kadem', pin_hash: '1999', role: 'admin' },
        { name: 'Marie Agnes', pin_hash: '2802', role: 'cashier' },
        { name: 'ASMSP', pin_hash: '5273', role: 'cashier' },
    ];
    const insertUser = db.prepare(`
        INSERT INTO users (name, pin_hash, role, is_active, created_at, updated_at)
        VALUES (@name, @pin_hash, @role, 1, @now, @now)
    `);
    const now = new Date().toISOString();
    const insertMany = db.transaction((users) => {
        for (const u of users) insertUser.run({ ...u, now });
    });
    insertMany(INITIAL_USERS);
    console.log(`[Database] Seeded ${INITIAL_USERS.length} users.`);
}

// Migration: Add columns if missing (for existing DBs)
try {
    const tableInfo = db.pragma('table_info(products)');

    // Check and add image_path
    if (!tableInfo.some(col => col.name === 'image_path')) {
        db.exec('ALTER TABLE products ADD COLUMN image_path TEXT');
        console.log('[Migration] Added image_path column');
    }

    // Check and add created_at
    if (!tableInfo.some(col => col.name === 'created_at')) {
        db.exec('ALTER TABLE products ADD COLUMN created_at TEXT');
        console.log('[Migration] Added created_at column');
    }

    // Check and add updated_at
    if (!tableInfo.some(col => col.name === 'updated_at')) {
        db.exec('ALTER TABLE products ADD COLUMN updated_at TEXT');
        console.log('[Migration] Added updated_at column');
    }



    // Check and add initial_amount to closures
    const closuresInfo = db.pragma('table_info(closures)');
    if (!closuresInfo.some(col => col.name === 'initial_amount')) {
        db.exec('ALTER TABLE closures ADD COLUMN initial_amount REAL DEFAULT 0');
        console.log('[Migration] Added initial_amount column to closures');
    }

    // Check and add device_name to closures
    if (!closuresInfo.some(col => col.name === 'device_name')) {
        db.exec('ALTER TABLE closures ADD COLUMN device_name TEXT');
        console.log('[Migration] Added device_name column to closures');
    }

    // Check and add device_name to cash_movements
    const movementsInfo = db.pragma('table_info(cash_movements)');
    if (!movementsInfo.some(col => col.name === 'device_name')) {
        db.exec('ALTER TABLE cash_movements ADD COLUMN device_name TEXT');
        console.log('[Migration] Added device_name column to cash_movements');
    }

} catch (error) {
    console.error('[Migration] Error:', error);
}

// ===================================
// API Routes
// ===================================

// Route moved below app init

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for dashboard
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images
}));

// CORS - Allow specific origins for security and reliability
app.use(cors({
    origin: [
        'http://localhost:1420',
        'http://127.0.0.1:1420',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'tauri://localhost',
        'app://localhost'
    ],
    credentials: true
}));

// Request logging
app.use(morgan('dev'));

// JSON body parsing
app.use(express.json({ limit: '10mb' }));

// ===================================
// API Routes
// ===================================

// Redirect root to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// Activity Log Endpoint
app.get('/api/activity', (req, res) => {
    try {
        const activity = db.prepare(`
            SELECT 
                'OUVERTURE' as type, 
                c.opened_at as date,
                u.name as user_name,
                c.initial_amount as amount,
                'Fond de caisse' as reason,
                c.device_name,
                c.local_id
            FROM closures c
            LEFT JOIN users u ON c.user_id = u.id
            UNION ALL
            SELECT 
                'CLOTURE' as type, 
                c.closed_at as date,
                u.name as user_name,
                c.actual_amount as amount,
                c.notes as reason,
                c.device_name,
                c.local_id
            FROM closures c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.closed_at IS NOT NULL
            UNION ALL
            SELECT 
                CASE WHEN m.type = 'deposit' THEN 'ENTREE' ELSE 'SORTIE' END as type,
                m.created_at as date,
                u.name as user_name,
                m.amount,
                m.reason,
                m.device_name,
                m.local_id
            FROM cash_movements m
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY date DESC
            LIMIT 100
        `).all();
        res.json(activity);
    } catch (error) {
        console.error('Activity log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static uploads with correct MIME types
console.log('[Server] Serving uploads from:', uploadsPath);
app.use('/uploads', express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.avif')) {
            res.setHeader('Content-Type', 'image/avif');
        }
    }
}));

// Upload endpoint with automatic JPEG conversion
app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Generate new filename with .jpg extension
        const timestamp = Date.now();
        const randomId = Math.floor(Math.random() * 1000000000);
        const outputFilename = `${timestamp}-${randomId}.jpg`;
        const outputPath = join(uploadsPath, outputFilename);

        // Convert to JPEG (works with AVIF, PNG, WebP, etc.)
        await sharp(req.file.path)
            .jpeg({ quality: 85 })
            .toFile(outputPath);

        // Delete original file
        fs.unlinkSync(req.file.path);

        const fileUrl = `/uploads/${outputFilename}`;

        res.json({
            success: true,
            path: fileUrl,
            filename: outputFilename
        });
    } catch (error) {
        console.error('Image conversion error:', error);
        // If conversion fails, try to use original
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({
            success: true,
            path: fileUrl,
            filename: req.file.filename
        });
    }
});

// ===== Transactions =====

// Sync transactions (batch upload)
app.post('/api/sync/transactions', (req, res) => {
    try {
        const { transactions } = req.body;
        if (!Array.isArray(transactions)) {
            return res.status(400).json({ error: 'Invalid transactions array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO transactions 
            (local_id, user_id, total_amount, payment_method, cash_received, change_given, items, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((txs) => {
            for (const tx of txs) {
                insert.run(
                    tx.id,
                    tx.userId,
                    tx.totalAmount,
                    tx.paymentMethod,
                    tx.cashReceived || null,
                    tx.changeGiven || null,
                    tx.items ? JSON.stringify(tx.items) : '[]',
                    tx.createdAt
                );
            }
        });

        insertMany(transactions);

        // Log sync
        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('transaction', ?, 'success')
        `).run(transactions.length);

        res.json({
            success: true,
            count: transactions.length,
            message: `${transactions.length} transactions synchronized`
        });
    } catch (error) {
        console.error('Sync transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all transactions (raw format - legacy)
app.get('/api/transactions/raw', (req, res) => {
    try {
        const { limit = 100, offset = 0, date } = req.query;

        let query = 'SELECT * FROM transactions';
        const params = [];

        if (date) {
            query += ' WHERE DATE(created_at) = ?';
            params.push(date);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const transactions = db.prepare(query).all(...params);

        // Parse items JSON
        const parsed = transactions.map(tx => ({
            ...tx,
            items: tx.items ? JSON.parse(tx.items) : [],
        }));

        res.json(parsed);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Closures =====

// Sync closures
app.post('/api/sync/closures', (req, res) => {
    try {
        const { closures } = req.body;
        if (!Array.isArray(closures)) {
            return res.status(400).json({ error: 'Invalid closures array' });
        }

        const insert = db.prepare(`
            INSERT INTO closures 
            (local_id, user_id, opened_at, closed_at, expected_amount, actual_amount, difference, notes, initial_amount, device_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(local_id, opened_at) DO UPDATE SET
                closed_at = excluded.closed_at,
                expected_amount = excluded.expected_amount,
                actual_amount = excluded.actual_amount,
                difference = excluded.difference,
                notes = excluded.notes,
                device_name = excluded.device_name
        `);

        const insertMany = db.transaction((items) => {
            for (const c of items) {
                insert.run(
                    c.id,
                    c.userId,
                    c.openedAt,
                    c.closedAt || null,
                    c.expectedAmount,
                    c.actualAmount || null,
                    c.difference || null,
                    c.notes || null,
                    c.initialAmount || 0,
                    c.deviceName || null
                );
            }
        });

        insertMany(closures);

        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('closure', ?, 'success')
        `).run(closures.length);

        res.json({
            success: true,
            count: closures.length,
            message: `${closures.length} closures synchronized`
        });
    } catch (error) {
        console.error('Sync closures error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync cash movements
app.post('/api/sync/cash-movements', (req, res) => {
    try {
        const { movements } = req.body;
        if (!Array.isArray(movements)) {
            return res.status(400).json({ error: 'Invalid movements array' });
        }


        const insert = db.prepare(`
            INSERT OR REPLACE INTO cash_movements 
            (local_id, closure_id, user_id, type, amount, reason, created_at, device_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Prepare lookup for closure ID
        const getClosureId = db.prepare('SELECT id FROM closures WHERE local_id = ?');

        const insertMany = db.transaction((items) => {
            for (const m of items) {
                const closure = getClosureId.get(m.closureId);
                if (closure) {
                    insert.run(
                        m.id,
                        closure.id, // Map local closure ID to server closure PK
                        m.userId,
                        m.type,
                        m.amount,
                        m.reason || null,
                        m.createdAt,
                        m.deviceName || null
                    );
                } else {
                    console.warn(`[Sync] Skipped movement ${m.id}: Closure ${m.closureId} not found`);
                }
            }
        });

        insertMany(movements);

        res.json({
            success: true,
            count: movements.length,
            message: `${movements.length} movements synchronized`
        });
    } catch (error) {
        console.error('Sync cash movements error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get closures
app.get('/api/closures', (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const closures = db.prepare(`
            SELECT * FROM closures 
            ORDER BY opened_at DESC 
            LIMIT ?
        `).all(Number(limit));

        res.json(closures);
    } catch (error) {
        console.error('Get closures error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Products =====

// Sync products
app.post('/api/sync/products', (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ error: 'Invalid products array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO products 
            (local_id, category_id, name, price, stock_quantity, alert_threshold, is_active, image_path, synced_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();

        const insertMany = db.transaction((items) => {
            for (const p of items) {
                insert.run(
                    p.id,
                    p.categoryId,
                    p.name,
                    p.price,
                    p.stockQuantity,
                    p.alertThreshold,
                    p.isActive ? 1 : 0,
                    p.imagePath || null, // image_path
                    now, // synced_at
                    p.updatedAt || now // updated_at
                );
            }
        });

        insertMany(products);

        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('product', ?, 'success')
        `).run(products.length);

        res.json({
            success: true,
            count: products.length,
            message: `${products.length} products synchronized`
        });
    } catch (error) {
        console.error('Sync products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Categories Sync =====

app.post('/api/sync/categories', (req, res) => {
    try {
        const { categories } = req.body;
        console.log('[Backend] Received categories to sync:', categories);
        if (!Array.isArray(categories)) {
            return res.status(400).json({ error: 'Invalid categories array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO categories 
            (local_id, name, color, icon, sort_order, is_active, created_at, updated_at, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();

        const insertMany = db.transaction((items) => {
            for (const c of items) {
                insert.run(
                    c.id,
                    c.name,
                    c.color || null,
                    c.icon || null,
                    c.sortOrder || 0,
                    c.isActive ? 1 : 0,
                    c.createdAt || now,
                    c.updatedAt || now,
                    now
                );
            }
        });

        insertMany(categories);

        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('category', ?, 'success')
        `).run(categories.length);

        res.json({
            success: true,
            count: categories.length,
            message: `${categories.length} categories synchronized`
        });
    } catch (error) {
        console.error('Sync categories error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Menus Sync =====

app.post('/api/sync/menus', (req, res) => {
    try {
        const { menus } = req.body;
        if (!Array.isArray(menus)) {
            return res.status(400).json({ error: 'Invalid menus array' });
        }

        const insertMenu = db.prepare(`
            INSERT OR REPLACE INTO menus 
            (local_id, name, description, price, image_path, is_active, synced_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertComponent = db.prepare(`
            INSERT INTO menu_components 
            (menu_id, category_id, label, quantity, is_required)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertAllowedProduct = db.prepare(`
            INSERT INTO menu_component_products 
            (component_id, product_id)
            VALUES (?, ?)
        `);

        const deleteComponents = db.prepare(`DELETE FROM menu_components WHERE menu_id = ?`);

        const now = new Date().toISOString();

        const insertMany = db.transaction((items) => {
            for (const menu of items) {
                // Insert or update menu
                insertMenu.run(
                    menu.id,
                    menu.name,
                    menu.description || null,
                    menu.price,
                    menu.imagePath || null,
                    menu.isActive ? 1 : 0,
                    now,
                    menu.updatedAt || now
                );

                // Get the menu's database ID
                const menuDbId = db.prepare('SELECT id FROM menus WHERE local_id = ?').get(menu.id)?.id;

                if (menuDbId && menu.components && menu.components.length > 0) {
                    // Delete existing components (cascade will delete allowed products)
                    deleteComponents.run(menuDbId);

                    // Insert new components
                    for (const component of menu.components) {
                        insertComponent.run(
                            menuDbId,
                            component.categoryId,
                            component.label,
                            component.quantity || 1,
                            component.isRequired ? 1 : 0
                        );

                        // Get the component's database ID
                        const componentDbId = db.prepare(
                            'SELECT id FROM menu_components WHERE menu_id = ? AND category_id = ? AND label = ? ORDER BY id DESC LIMIT 1'
                        ).get(menuDbId, component.categoryId, component.label)?.id;

                        // Insert allowed products for this component
                        if (componentDbId && component.allowedProductIds && component.allowedProductIds.length > 0) {
                            for (const productId of component.allowedProductIds) {
                                // Check if product exists in backend database
                                const productExists = db.prepare('SELECT id FROM products WHERE local_id = ?').get(productId);
                                if (productExists) {
                                    try {
                                        insertAllowedProduct.run(componentDbId, productId);
                                    } catch (err) {
                                        console.warn(`[Menu Sync] Failed to add product ${productId} to component ${componentDbId}:`, err.message);
                                    }
                                } else {
                                    console.warn(`[Menu Sync] Product ${productId} not found in backend, skipping`);
                                }
                            }
                        }
                    }
                }
            }
        });

        insertMany(menus);

        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('menu', ?, 'success')
        `).run(menus.length);

        res.json({
            success: true,
            count: menus.length,
            message: `${menus.length} menus synchronized`
        });
    } catch (error) {
        console.error('Sync menus error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Stock Movements =====

app.post('/api/sync/stock-movements', (req, res) => {
    try {
        const { movements } = req.body;
        if (!Array.isArray(movements)) {
            return res.status(400).json({ error: 'Invalid movements array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO stock_movements 
            (local_id, product_id, user_id, type, quantity, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items) => {
            for (const m of items) {
                insert.run(
                    m.id,
                    m.productId,
                    m.userId,
                    m.type,
                    m.quantity,
                    m.reason || null,
                    m.createdAt
                );
            }
        });

        insertMany(movements);

        res.json({
            success: true,
            count: movements.length,
        });
    } catch (error) {
        console.error('Sync stock movements error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Sales & Stock Management =====

app.post('/api/sales', (req, res) => {
    try {
        const { userId, totalAmount, paymentMethod, cashReceived, changeGiven, items } = req.body;

        // Validation
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid items array' });
        }

        const now = new Date().toISOString();
        const localId = Date.now(); // Simple local ID generation

        const processSale = db.transaction(() => {
            // 1. Record Transaction
            db.prepare(`
                INSERT INTO transactions 
                (local_id, user_id, total_amount, payment_method, cash_received, change_given, items, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                localId,
                userId,
                totalAmount,
                paymentMethod,
                cashReceived || 0,
                changeGiven || 0,
                JSON.stringify(items),
                now
            );

            // 2. Decrement Stock for each product
            const updateStock = db.prepare(`
                UPDATE products 
                SET stock_quantity = stock_quantity - ?, updated_at = ?
                WHERE id = ?
            `);

            // 3. Record Stock Movement
            const insertMovement = db.prepare(`
                INSERT INTO stock_movements 
                (local_id, product_id, user_id, type, quantity, reason, created_at)
                VALUES (?, ?, ?, 'sale', ?, 'Vente', ?)
            `);

            for (const item of items) {
                // Ensure we have a product ID (handle menu items vs direct products)
                // For menu items, we might need to decrement the main product if tracking stock there, 
                // OR decrement component products. 
                // Assumption: 'items' comes flat or we handle it. 
                // For now, let's assume 'items' contains 'product' object with 'id' (local_id).

                const productId = item.product.id;
                const quantity = item.quantity;

                if (productId) {
                    // Update using the PRIMARY KEY (id)
                    console.log(`[Sale] Updating stock for Product ID: ${productId} (Qty: -${quantity})`);
                    const result = updateStock.run(quantity, now, productId);
                    console.log(`[Sale] Rows affected: ${result.changes}`);

                    // Link movement to the product
                    insertMovement.run(
                        Date.now() + Math.random(), // Unique ID
                        productId,
                        userId,
                        -quantity,
                        now
                    );
                } else {
                    console.warn(`[Sale] Item missing product ID:`, item);
                }
            }
        });

        processSale();

        res.json({
            success: true,
            message: 'Sale recorded and stock updated',
            transactionId: localId
        });

    } catch (error) {
        console.error('Process sale error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Sync Diff (Pull) =====

app.get('/api/sync/diff', (req, res) => {
    try {
        const { since } = req.query;
        // Default to epoch if no timestamp provided
        const lastSync = since ? new Date(since).toISOString() : '1970-01-01T00:00:00.000Z';

        console.log(`[Sync Diff] Requesting changes since ${lastSync}`);

        // Get updated products
        const products = db.prepare(`
            SELECT 
                id, local_id as localId, category_id as categoryId, 
                name, price, stock_quantity as stockQuantity, 
                alert_threshold as alertThreshold, is_active as isActive,
                image_path as imagePath,
                created_at as createdAt,
                updated_at as updatedAt
            FROM products 
            WHERE updated_at > ?
        `).all(lastSync);

        // Map boolean fields
        const productsFormatted = products.map(p => ({
            ...p,
            isActive: Boolean(p.isActive)
        }));

        // Get updated menus with their components
        const menus = db.prepare(`
            SELECT 
                id, local_id as localId, name, description, price,
                image_path as imagePath, is_active as isActive,
                created_at as createdAt, updated_at as updatedAt
            FROM menus 
            WHERE synced_at > ?
        `).all(lastSync);

        // Get components for each menu
        const menusFormatted = menus.map(menu => {
            const components = db.prepare(`
                SELECT 
                    mc.id, mc.category_id as categoryId, mc.label, 
                    mc.quantity, mc.is_required as isRequired
                FROM menu_components mc
                WHERE mc.menu_id = ?
            `).all(menu.id);

            // Get allowed products for each component
            const componentsWithProducts = components.map(comp => {
                const allowedProductIds = db.prepare(`
                    SELECT product_id as productId
                    FROM menu_component_products
                    WHERE component_id = ?
                `).all(comp.id).map(p => p.productId);

                return {
                    id: comp.id,
                    categoryId: comp.categoryId,
                    label: comp.label,
                    quantity: comp.quantity,
                    isRequired: Boolean(comp.isRequired),
                    allowedProductIds
                };
            });

            return {
                ...menu,
                isActive: Boolean(menu.isActive),
                components: componentsWithProducts
            };
        });

        // Get updated categories (return local_id as id for client compatibility)
        const categories = db.prepare(`
            SELECT 
                local_id as id, local_id as localId, name, color, icon,
                sort_order as sortOrder, is_active as isActive,
                created_at as createdAt, updated_at as updatedAt
            FROM categories 
            WHERE updated_at > ? OR synced_at > ?
        `).all(lastSync, lastSync);

        // Map boolean fields for categories
        const categoriesFormatted = categories.map(c => ({
            ...c,
            isActive: Boolean(c.isActive)
        }));

        // Get updated users
        const users = db.prepare(`
            SELECT 
                id, id as localId, name, pin_hash as pinHash, role, 
                is_active as isActive, created_at as createdAt, updated_at as updatedAt
            FROM users 
            WHERE updated_at > ?
        `).all(lastSync);

        const usersFormatted = users.map(u => ({
            ...u,
            isActive: Boolean(u.isActive)
        }));

        console.log('[Backend] /sync/diff returning categories:', categoriesFormatted.length, 'users:', usersFormatted.length);

        res.json({
            ts: new Date().toISOString(),
            products: productsFormatted,
            menus: menusFormatted,
            categories: categoriesFormatted,
            users: usersFormatted,
        });
    } catch (error) {
        console.error('Sync diff error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Statistics =====

app.get('/api/stats', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Today's stats
        const todayStats = db.prepare(`
            SELECT
        COUNT(*) as transaction_count,
            COALESCE(SUM(total_amount), 0) as total_sales,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
            COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales
            FROM transactions 
            WHERE DATE(created_at) = ?
            `).get(today);

        // This week stats
        const weekStats = db.prepare(`
            SELECT
        COUNT(*) as transaction_count,
            COALESCE(SUM(total_amount), 0) as total_sales
            FROM transactions 
            WHERE DATE(created_at) >= DATE('now', '-7 days')
            `).get();

        // This month stats
        const monthStats = db.prepare(`
        SELECT
        COUNT(*) as transaction_count,
            COALESCE(SUM(total_amount), 0) as total_sales
            FROM transactions 
            WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
            `).get();

        // Recent sync log
        const recentSyncs = db.prepare(`
        SELECT * FROM sync_log 
            ORDER BY created_at DESC 
            LIMIT 10
            `).all();

        res.json({
            today: todayStats,
            week: weekStats,
            month: monthStats,
            recentSyncs,
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Daily breakdown for charts
app.get('/api/stats/daily', (req, res) => {
    try {
        const { days = 7 } = req.query;

        const dailyStats = db.prepare(`
        SELECT
        DATE(created_at) as date,
            COUNT(*) as transaction_count,
            SUM(total_amount) as total_sales
            FROM transactions 
            WHERE DATE(created_at) >= DATE('now', '-' || ? || ' days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
            `).all(Number(days));

        res.json(dailyStats);
    } catch (error) {
        console.error('Get daily stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Cash Closure Endpoints
// ===================================

// Get current session data (Open status, stats, etc.)
app.get('/api/closure/current-session', (req, res) => {
    try {
        // Find if there is an open closure
        const openClosure = db.prepare('SELECT * FROM closures WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1').get();

        if (!openClosure) {
            return res.json({ isOpen: false });
        }

        const openedAt = openClosure.opened_at;

        // Get transactions since opening
        const transactions = db.prepare(`
            SELECT 
                id, user_id as userId, total_amount as totalAmount, 
                payment_method as paymentMethod, cash_received as cashReceived,
                change_given as changeGiven, created_at as createdAt
            FROM transactions 
            WHERE created_at >= ?
            ORDER BY created_at DESC
        `).all(openedAt);

        // Get cash movements since opening (linked to this closure)
        const movements = db.prepare(`
            SELECT * FROM cash_movements WHERE closure_id = ? ORDER BY created_at DESC
        `).all(openClosure.id);

        // Calculate totals
        let totalCash = 0;
        let totalCard = 0;
        let totalMixed = 0;

        transactions.forEach(t => {
            const amount = t.totalAmount;
            if (t.paymentMethod === 'cash') totalCash += amount;
            else if (t.paymentMethod === 'card') totalCard += amount;
            else if (t.paymentMethod === 'mixed') totalMixed += amount;
        });

        const totalSales = totalCash + totalCard + totalMixed;
        const totalWithdrawals = movements
            .filter(m => m.type === 'withdrawal')
            .reduce((sum, m) => sum + m.amount, 0);
        const totalDeposits = movements
            .filter(m => m.type === 'deposit')
            .reduce((sum, m) => sum + m.amount, 0);

        // Expected cash in drawer = Initial + Cash Sales - Withdrawals + Deposits
        // Note: Mix payments might need split if we tracked exact cash part, but usually mixed = some cash. 
        // For simplicity, assuming mixed counts towards total but maybe not fully cash. 
        // If we want exact cash, we need 'cash_received' - 'change_given' for all transactions? 
        // Or just assume 'totalAmount' for cash/mixed is the revenue.
        // Let's stick to totalCash stats provided.
        // If mixed payment exists, we should probably check if we store the cash part. 
        // The transaction struct has `cashReceived` but that includes change.
        // Let's assume totalCash (from pure cash tx) + cash part of mixed? 
        // The current aggregation logic above puts 'mixed' in 'totalMixed'. 
        // Let's leave expected calculation to the frontend or be simple here: 
        // Expected Cash = Initial + Sales(Cash) + Sales(Mixed??) - Withdrawals. 
        // Ideally Mixed stores how much was cash.

        res.json({
            isOpen: true,
            closureId: openClosure.id,
            openedAt: openClosure.opened_at,
            initialAmount: openClosure.initial_amount || 0,
            transactionCount: transactions.length,
            totalCash,
            totalCard,
            totalMixed,
            totalSales,
            totalWithdrawals,
            totalDeposits,
            transactions: transactions.map(t => ({ ...t, createdAt: new Date(t.createdAt) })),
            movements: movements.map(m => ({ ...m, createdAt: new Date(m.created_at) }))
        });

    } catch (error) {
        console.error('Get current session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Open a new closure session
app.post('/api/closures/open', (req, res) => {
    try {
        const { userId, initialAmount } = req.body;

        if (!userId || initialAmount === undefined) {
            return res.status(400).json({ error: 'Missing defined fields (userId, initialAmount)' });
        }

        // Check if already open
        const openClosure = db.prepare('SELECT id FROM closures WHERE closed_at IS NULL').get();
        if (openClosure) {
            return res.status(400).json({ error: 'Une session de caisse est déjà ouverte.' });
        }

        const now = new Date().toISOString();
        const localId = Date.now();

        const result = db.prepare(`
            INSERT INTO closures (local_id, user_id, opened_at, initial_amount, expected_amount)
            VALUES (?, ?, ?, ?, ?)
        `).run(localId, userId, now, initialAmount, 0); // expected_amount init 0, updated at close

        res.json({ success: true, id: result.lastInsertRowid, message: 'Caisse ouverte' });
    } catch (error) {
        console.error('Open closure error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Close a closure session
app.post('/api/closures/close', (req, res) => {
    try {
        const { userId, actualAmount, notes } = req.body;
        // We calculate expectedAmount server-side or trust client? 
        // Better server-side for integrity, but client has the view. 
        // Let's recalculate expected here to be safe, or just take what client gives if simpler.
        // Let's trust client for expectedAmount mostly, BUT we should store what we think too?
        // The DB has 'expected_amount'. Let's accept it from body or calc it. 
        // To allow client full control (since they see the logic), let's accept `expectedAmount` from body too.

        const { expectedAmount } = req.body;

        if (!userId || actualAmount === undefined) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const openClosure = db.prepare('SELECT * FROM closures WHERE closed_at IS NULL').get();
        if (!openClosure) {
            return res.status(400).json({ error: 'Aucune session ouverte à clôturer.' });
        }

        const now = new Date().toISOString();
        const difference = actualAmount - expectedAmount;

        db.prepare(`
            UPDATE closures 
            SET closed_at = ?, expected_amount = ?, actual_amount = ?, difference = ?, notes = ?
            WHERE id = ?
        `).run(now, expectedAmount, actualAmount, difference, notes || null, openClosure.id);

        res.json({ success: true, message: 'Caisse clôturée' });

    } catch (error) {
        console.error('Close closure error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add cash movement (Withdrawal/Deposit)
app.post('/api/cash-movements', (req, res) => {
    try {
        const { userId, type, amount, reason } = req.body;

        if (!userId || !type || !amount) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const openClosure = db.prepare('SELECT id FROM closures WHERE closed_at IS NULL').get();
        if (!openClosure) {
            return res.status(400).json({ error: 'Aucune caisse ouverte.' });
        }

        const now = new Date().toISOString();
        const localId = Date.now();

        db.prepare(`
            INSERT INTO cash_movements (local_id, closure_id, user_id, type, amount, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(localId, openClosure.id, userId, type, amount, reason || null, now);

        res.json({ success: true, message: 'Mouvement enregistré' });

    } catch (error) {
        console.error('Cash movement error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Transactions & Stock Movements Endpoints
// ===================================

// Get transactions with optional filtering
app.get('/api/transactions', (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;

        let query = `
            SELECT 
                id, local_id as localId, user_id as userId, 
                total_amount as totalAmount, payment_method as paymentMethod,
                cash_received as cashReceived, change_given as changeGiven,
                items,
                created_at as createdAt
            FROM transactions
        `;

        const conditions = [];
        const params = [];

        if (startDate) {
            conditions.push('DATE(created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            conditions.push('DATE(created_at) <= ?');
            params.push(endDate);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC';

        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }

        const transactions = db.prepare(query).all(...params);

        // Get all products for name resolution
        const products = db.prepare('SELECT id, local_id, name, price FROM products').all();
        const productMap = {};
        products.forEach(p => {
            productMap[p.id] = p;
            productMap[p.local_id] = p;
        });

        // Resolve product names in items
        const resolveItems = (items) => {
            if (!items) return [];
            const parsed = typeof items === 'string' ? JSON.parse(items) : items;
            return parsed.map(item => {
                const productId = item.product?.id || item.product?.localId || item.productId || item.id;
                const product = productMap[productId];
                return {
                    name: product?.name || item.name || item.productName || 'Produit inconnu',
                    quantity: item.quantity || 1,
                    price: product?.price || item.price || 0
                };
            });
        };

        res.json({
            transactions: transactions.map(t => ({
                ...t,
                items: resolveItems(t.items),
                createdAt: new Date(t.createdAt)
            })),
            count: transactions.length
        });

    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get stock movements with optional filtering
app.get('/api/stock-movements', (req, res) => {
    try {
        const { productId, type, limit } = req.query;

        let query = `
            SELECT 
                sm.id, sm.local_id as localId, sm.product_id as productId,
                sm.user_id as userId, sm.type, sm.quantity, sm.reason,
                sm.created_at as createdAt,
                p.name as productName
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
        `;

        const conditions = [];
        const params = [];

        if (productId) {
            conditions.push('sm.product_id = ?');
            params.push(parseInt(productId));
        }

        if (type) {
            conditions.push('sm.type = ?');
            params.push(type);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY sm.created_at DESC';

        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }

        const movements = db.prepare(query).all(...params);

        res.json({
            movements: movements.map(m => ({
                ...m,
                createdAt: new Date(m.createdAt)
            })),
            count: movements.length
        });

    } catch (error) {
        console.error('Get stock movements error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a new stock movement and update product stock
app.post('/api/stock-movements', (req, res) => {
    try {
        const { productId, userId, type, quantity, reason } = req.body;

        if (!productId || !type || !quantity) {
            return res.status(400).json({ error: 'Missing required fields: productId, type, quantity' });
        }

        const now = new Date().toISOString();
        const localId = Date.now();

        // Get current product stock
        const product = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Calculate new stock
        let newStock;
        if (type === 'in' || type === 'entry') {
            newStock = product.stock_quantity + quantity;
        } else if (type === 'out' || type === 'exit') {
            newStock = Math.max(0, product.stock_quantity - quantity);
        } else {
            return res.status(400).json({ error: 'Invalid type. Must be "in", "out", "entry", or "exit"' });
        }

        // Insert stock movement
        db.prepare(`
            INSERT INTO stock_movements 
            (local_id, product_id, user_id, type, quantity, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(localId, productId, userId || 1, type, quantity, reason || null, now);

        // Update product stock
        db.prepare(`
            UPDATE products 
            SET stock_quantity = ?, updated_at = ?
            WHERE id = ?
        `).run(newStock, now, productId);

        console.log(`[Stock] Movement: ${type} ${quantity} for Product ID ${productId}. New stock: ${newStock}`);

        res.json({
            success: true,
            movement: {
                id: localId,
                productId,
                type,
                quantity,
                reason,
                createdAt: now
            },
            newStock
        });

    } catch (error) {
        console.error('Create stock movement error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== Users Management =====

// Sync users
app.post('/api/sync/users', (req, res) => {
    try {
        const { users } = req.body;
        if (!Array.isArray(users)) {
            return res.status(400).json({ error: 'Invalid users array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO users 
            (id, name, pin_hash, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        // If client sends localId, we might need to handle ID mapping if we want strict server authority.
        // But for this simple offline-first, we can just upsert. 
        // Note: Client generates numeric IDs. Server uses AUTOINCREMENT if we let it, but if we pass ID it uses it.
        // SyncStore user sync sends 'User' object which has 'id'.

        const now = new Date().toISOString();

        const insertMany = db.transaction((items) => {
            for (const u of items) {
                // If it's a new user from client (negative or large temporary ID?), we might treat it differently.
                // But typically SyncStore sends what it has.
                // For simplicity, we accept the ID from client to keep consistency, 
                // OR we check if exists.

                // Let's assume we trust the ID if it matches existing or is new.
                // Caution: ID collisions possible if multiple devices create users offline.
                // Ideal: Client sends local_id, server assigns real ID.
                // But our schema says: id INTEGER PRIMARY KEY AUTOINCREMENT
                // We can insert with specific ID.

                insert.run(
                    u.id,
                    u.name,
                    u.pinHash,
                    u.role,
                    u.isActive ? 1 : 0,
                    u.createdAt || now,
                    u.updatedAt || now
                );
            }
        });

        insertMany(users);

        db.prepare(`
            INSERT INTO sync_log (entity_type, entity_count, status)
            VALUES ('user', ?, 'success')
        `).run(users.length);

        res.json({
            success: true,
            count: users.length,
            message: `${users.length} users synchronized`
        });
    } catch (error) {
        console.error('Sync users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users
app.get('/api/users', (req, res) => {
    try {
        const users = db.prepare('SELECT id, name, pin_hash as pinHash, role, is_active as isActive, created_at as createdAt, updated_at as updatedAt FROM users ORDER BY name').all();
        res.json({
            success: true,
            users: users.map(u => ({
                ...u,
                isActive: !!u.isActive,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create user
app.post('/api/users', (req, res) => {
    try {
        const { name, pin, role } = req.body;
        if (!name || !pin || !role) {
            return res.status(400).json({ error: 'Missing required fields: name, pin, role' });
        }

        const now = new Date().toISOString();
        const result = db.prepare(`
            INSERT INTO users (name, pin_hash, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
        `).run(name, pin, role, now, now);

        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'User created'
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user
app.put('/api/users/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, pin, role, isActive } = req.body;

        const now = new Date().toISOString();
        const updates = [];
        const params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (pin) { updates.push('pin_hash = ?'); params.push(pin); }
        if (role) { updates.push('role = ?'); params.push(role); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        const result = db.prepare(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `).run(...params);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Dashboard (Static HTML)
// ===================================

app.get('/dashboard', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CaisseFacile ASMSP - Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
            min-height: 100vh;
            color: #e2e8f0;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        h1 { font-size: 1.75rem; display: flex; align-items: center; gap: 0.5rem; }
        .status { padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.875rem; }
        .status.online { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 1.5rem;
        }
        .stat-card h3 { font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem; }
        .stat-card .value { font-size: 2rem; font-weight: 700; }
        .stat-card .sub { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
        .section { margin-bottom: 2rem; }
        .section h2 { font-size: 1.25rem; margin-bottom: 1rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        th { color: #94a3b8; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
        .amount { color: #10b981; font-weight: 600; }
        .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
        .badge.cash { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .badge.card { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
        .badge.start { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .badge.end { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .badge.in { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
        .badge.out { background: rgba(249, 115, 22, 0.2); color: #f97316; }
        .refresh-btn {
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.3);
            color: #3b82f6;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.875rem;
        }
        .refresh-btn:hover { background: rgba(59, 130, 246, 0.3); }
        .loading { opacity: 0.5; }
        @media (max-width: 768px) {
            .container { padding: 1rem; }
            .stat-card .value { font-size: 1.5rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>CaisseFacile ASMSP - Dashboard</h1>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <span class="status online" id="status">● En ligne</span>
                <button class="refresh-btn" onclick="loadData()">↻ Actualiser</button>
            </div>
        </header>

        <div class="stats-grid" id="stats">
            <div class="stat-card">
                <h3>CA Aujourd'hui</h3>
                <div class="value" id="today-sales">--</div>
                <div class="sub" id="today-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>CA Semaine</h3>
                <div class="value" id="week-sales">--</div>
                <div class="sub" id="week-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>CA Mois</h3>
                <div class="value" id="month-sales">--</div>
                <div class="sub" id="month-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>Espèces (Aujourd'hui)</h3>
                <div class="value" id="today-cash">--</div>
            </div>
        </div>

        <div class="section">
            <h2>Transactions</h2>
            <div class="filters" style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: flex-end;">
                <div class="filter-group">
                    <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Date début</label>
                    <input type="date" id="filter-start-date" style="padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #e2e8f0;">
                </div>
                <div class="filter-group">
                    <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Date fin</label>
                    <input type="date" id="filter-end-date" style="padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #e2e8f0;">
                </div>
                <div class="filter-group">
                    <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Paiement</label>
                    <select id="filter-payment" style="padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #e2e8f0;">
                        <option value="">Tous</option>
                        <option value="cash">Espèces</option>
                        <option value="card">Carte</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Produit</label>
                    <input type="text" id="filter-product" placeholder="Rechercher..." style="padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #e2e8f0;">
                </div>
                <button class="refresh-btn" onclick="applyFilters()" style="height: 38px;">Filtrer</button>
                <button class="refresh-btn" onclick="resetFilters()" style="height: 38px; background: rgba(100,116,139,0.2); border-color: rgba(100,116,139,0.3); color: #94a3b8;">Réinitialiser</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Produits</th>
                        <th>Montant</th>
                        <th>Paiement</th>
                    </tr>
                </thead>
                <tbody id="transactions-table">
                    <tr><td colspan="5" style="text-align:center;">Chargement...</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="section">
            <h2>Journal de Caisse</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Utilisateur</th>
                        <th>Caisse</th>
                        <th>Type</th>
                        <th>Montant</th>
                        <th>Motif</th>
                    </tr>
                </thead>
                <tbody id="activity-table">
                    <tr><td colspan="6" style="text-align:center;">Chargement...</td></tr>
                </tbody>
            </table>
        </div>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
            <a href="/z-caisse" class="refresh-btn" style="text-decoration: none; display: inline-block;">Rapport Z de Caisse</a>
        </div>
    </div>

    <script>
        function formatPrice(n) {
            return (n || 0).toFixed(2).replace('.', ',') + ' €';
        }

        function formatDate(d) {
            return new Date(d).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        }

        function formatItems(items) {
            if (!items || !Array.isArray(items) || items.length === 0) {
                return '<span style="color:#64748b;">-</span>';
            }
            return items.map(item => {
                const name = item.name || item.productName || 'Produit';
                const qty = item.quantity || 1;
                return qty > 1 ? name + ' ×' + qty : name;
            }).join(', ');
        }

        let allTransactions = [];

        async function loadData(filters = {}) {
            try {
                const statsRes = await fetch('/api/stats');
                const stats = await statsRes.json();

                document.getElementById('today-sales').textContent = formatPrice(stats.today.total_sales);
                document.getElementById('today-count').textContent = stats.today.transaction_count + ' transactions';
                document.getElementById('today-cash').textContent = formatPrice(stats.today.cash_sales);
                document.getElementById('week-sales').textContent = formatPrice(stats.week.total_sales);
                document.getElementById('week-count').textContent = stats.week.transaction_count + ' transactions';
                document.getElementById('month-sales').textContent = formatPrice(stats.month.total_sales);
                document.getElementById('month-count').textContent = stats.month.transaction_count + ' transactions';

                let apiUrl = '/api/transactions?limit=100';
                if (filters.startDate) apiUrl += '&startDate=' + filters.startDate;
                if (filters.endDate) apiUrl += '&endDate=' + filters.endDate;

                const txRes = await fetch(apiUrl);
                const result = await txRes.json();
                allTransactions = result.transactions || [];

                renderTransactions(filters);

                // Load activity
                const activityRes = await fetch('/api/activity');
                const activityItems = await activityRes.json();
                renderActivity(activityItems);

            } catch (err) {
                console.error('Error loading data:', err);
                document.getElementById('status').className = 'status';
                document.getElementById('status').textContent = '● Erreur';
            }
        }

        function renderTransactions(filters = {}) {
            let transactions = [...allTransactions];

            // Filter by payment method
            if (filters.paymentMethod) {
                transactions = transactions.filter(tx => 
                    (tx.paymentMethod || tx.payment_method) === filters.paymentMethod
                );
            }

            // Filter by product name
            if (filters.productSearch) {
                const search = filters.productSearch.toLowerCase();
                transactions = transactions.filter(tx => {
                    const items = tx.items || [];
                    return items.some(item => {
                        const name = (item.name || item.productName || '').toLowerCase();
                        return name.includes(search);
                    });
                });
            }

            const tbody = document.getElementById('transactions-table');
            if (transactions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Aucune transaction</td></tr>';
            } else {
                tbody.innerHTML = transactions.map(tx => \`
                    <tr>
                        <td>#\${tx.localId || tx.local_id}</td>
                        <td>\${formatDate(tx.createdAt || tx.created_at)}</td>
                        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${formatItems(tx.items)}</td>
                        <td class="amount">\${formatPrice(tx.totalAmount || tx.total_amount)}</td>
                        <td><span class="badge \${tx.paymentMethod || tx.payment_method}">\${(tx.paymentMethod || tx.payment_method) === 'cash' ? 'Espèces' : 'Carte'}</span></td>
                    </tr>
                \`).join('');
            }
        }

        function renderActivity(items) {
            const tbody = document.getElementById('activity-table');
            if (!items || !Array.isArray(items) || items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">Aucune activité</td></tr>';
                return;
            }
            tbody.innerHTML = items.map(item => {
                let badgeClass = 'badge';
                if (item.type === 'OUVERTURE') badgeClass += ' start';
                else if (item.type === 'CLOTURE') badgeClass += ' end';
                else if (item.type === 'ENTREE') badgeClass += ' in';
                else if (item.type === 'SORTIE') badgeClass += ' out';

                return \`
                    <tr>
                        <td>\${formatDate(item.date)}</td>
                        <td>\${item.user_name || '-'}</td>
                        <td>\${item.device_name ? '🖥️ ' + item.device_name : 'Poste Local'}</td>
                        <td><span class="\${badgeClass}">\${item.type}</span></td>
                        <td class="amount">\${formatPrice(item.amount)}</td>
                        <td style="color: #cbd5e1; font-style: italic;">\${item.reason || ''}</td>
                    </tr>
                \`;
            }).join('');
        }

        function applyFilters() {
            const filters = {
                startDate: document.getElementById('filter-start-date').value,
                endDate: document.getElementById('filter-end-date').value,
                paymentMethod: document.getElementById('filter-payment').value,
                productSearch: document.getElementById('filter-product').value
            };
            loadData(filters);
        }

        function resetFilters() {
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';
            document.getElementById('filter-payment').value = '';
            document.getElementById('filter-product').value = '';
            loadData();
        }

        loadData();
        setInterval(() => loadData(), 30000);
    </script>
</body>
</html>`);
});

// ===================================
// Z de Caisse (Cash Closure Report)
// ===================================

// API endpoint for Z de Caisse data
app.get('/api/z-caisse', (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate) {
            return res.status(400).json({ error: 'startDate is required' });
        }

        const effectiveEndDate = endDate || startDate;

        // Get transactions for the period
        const transactions = db.prepare(`
            SELECT 
                id, local_id as localId, user_id as userId, 
                total_amount as totalAmount, payment_method as paymentMethod,
                cash_received as cashReceived, change_given as changeGiven,
                items,
                created_at as createdAt
            FROM transactions
            WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
            ORDER BY created_at DESC
        `).all(startDate, effectiveEndDate);

        // Get all products for name resolution
        const products = db.prepare('SELECT id, local_id, name, price FROM products').all();
        const productMap = {};
        products.forEach(p => {
            productMap[p.id] = p;
            productMap[p.local_id] = p;
        });

        // Resolve product names in items
        const resolveItems = (items) => {
            if (!items) return [];
            const parsed = typeof items === 'string' ? JSON.parse(items) : items;
            return parsed.map(item => {
                const productId = item.product?.id || item.product?.localId || item.productId || item.id;
                const product = productMap[productId];
                return {
                    name: product?.name || item.name || item.productName || 'Produit inconnu',
                    quantity: item.quantity || 1,
                    price: product?.price || item.price || 0
                };
            });
        };

        // Calculate totals
        let totalCash = 0;
        let totalCard = 0;
        let totalMixed = 0;
        let countCash = 0;
        let countCard = 0;
        let countMixed = 0;

        transactions.forEach(t => {
            const amount = t.totalAmount;
            if (t.paymentMethod === 'cash') {
                totalCash += amount;
                countCash++;
            } else if (t.paymentMethod === 'card') {
                totalCard += amount;
                countCard++;
            } else if (t.paymentMethod === 'mixed') {
                totalMixed += amount;
                countMixed++;
            }
        });

        const total = totalCash + totalCard + totalMixed;

        // Build product summary
        const productSummary = {};
        transactions.forEach(t => {
            const items = resolveItems(t.items);
            items.forEach(item => {
                const name = item.name;
                const qty = item.quantity || 1;
                const price = item.price || 0;
                if (!productSummary[name]) {
                    productSummary[name] = { quantity: 0, total: 0 };
                }
                productSummary[name].quantity += qty;
                productSummary[name].total += price * qty;
            });
        });

        res.json({
            period: { startDate, endDate: effectiveEndDate },
            summary: {
                transactionCount: transactions.length,
                totalCash,
                totalCard,
                totalMixed,
                total,
                countCash,
                countCard,
                countMixed
            },
            productSummary: Object.entries(productSummary).map(([name, data]) => ({
                name,
                quantity: data.quantity,
                total: data.total
            })).sort((a, b) => b.quantity - a.quantity),
            transactions: transactions.map(t => ({
                ...t,
                items: resolveItems(t.items),
                createdAt: new Date(t.createdAt)
            })),
            activity: (() => {
                try {
                    return db.prepare(`
                    SELECT 
                        'OUVERTURE' as type, 
                        c.opened_at as date,
                        u.name as user_name,
                        c.initial_amount as amount,
                        'Fond de caisse' as reason,
                        c.device_name
                    FROM closures c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE DATE(c.opened_at) >= ? AND DATE(c.opened_at) <= ?
                    UNION ALL
                    SELECT 
                        'CLOTURE' as type, 
                        c.closed_at as date,
                        u.name as user_name,
                        c.actual_amount as amount,
                        c.notes as reason,
                        c.device_name
                    FROM closures c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE c.closed_at IS NOT NULL AND DATE(c.closed_at) >= ? AND DATE(c.closed_at) <= ?
                    UNION ALL
                    SELECT 
                        CASE WHEN m.type = 'deposit' THEN 'ENTREE' ELSE 'SORTIE' END as type,
                        m.created_at as date,
                        u.name as user_name,
                        m.amount,
                        m.reason,
                        m.device_name
                    FROM cash_movements m
                    LEFT JOIN users u ON m.user_id = u.id
                    WHERE DATE(m.created_at) >= ? AND DATE(m.created_at) <= ?
                    ORDER BY date DESC
                `).all(startDate, effectiveEndDate, startDate, effectiveEndDate, startDate, effectiveEndDate);
                } catch (e) { console.error(e); return []; }
            })()
        });

    } catch (error) {
        console.error('Z de caisse error:', error);
        res.status(500).json({ error: error.message });
    }
});

// CSV Export endpoint
app.get('/api/z-caisse/export/csv', (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate) {
            return res.status(400).json({ error: 'startDate is required' });
        }

        const effectiveEndDate = endDate || startDate;

        const transactions = db.prepare(`
            SELECT 
                local_id as localId, 
                total_amount as totalAmount, 
                payment_method as paymentMethod,
                items,
                created_at as createdAt
            FROM transactions
            WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
            ORDER BY created_at DESC
        `).all(startDate, effectiveEndDate);

        // Get all products for name resolution
        const products = db.prepare('SELECT id, local_id, name, price FROM products').all();
        const productMap = {};
        products.forEach(p => {
            productMap[p.id] = p;
            productMap[p.local_id] = p;
        });

        // Calculate totals for CSV header
        let totalCash = 0, totalCard = 0, totalMixed = 0;
        const productSummaryMap = {};

        transactions.forEach(t => {
            if (t.paymentMethod === 'cash') totalCash += t.totalAmount;
            else if (t.paymentMethod === 'card') totalCard += t.totalAmount;
            else if (t.paymentMethod === 'mixed') totalMixed += t.totalAmount;

            const items = t.items ? JSON.parse(t.items) : [];
            items.forEach(item => {
                const productId = item.product?.id || item.product?.localId || item.productId || item.id;
                const product = productMap[productId];
                const name = product?.name || item.name || item.productName || 'Produit';
                if (!productSummaryMap[name]) productSummaryMap[name] = { qty: 0, total: 0 };
                productSummaryMap[name].qty += (item.quantity || 1);
                productSummaryMap[name].total += (item.price || 0) * (item.quantity || 1);
            });
        });

        // Build CSV
        let csv = 'RAPPORT Z DE CAISSE\n';
        csv += `Periode;${startDate} au ${effectiveEndDate}\n\n`;

        csv += 'RESUME DES VENTES\n';
        csv += `Total Especes;${totalCash.toFixed(2)} EUR\n`;
        csv += `Total Carte;${totalCard.toFixed(2)} EUR\n`;
        if (totalMixed > 0) csv += `Total Mixte;${totalMixed.toFixed(2)} EUR\n`;
        csv += `TOTAL GENERAL;${(totalCash + totalCard + totalMixed).toFixed(2)} EUR\n\n`;

        csv += 'VENTES PAR PRODUIT\n';
        csv += 'Produit;Quantite;Total\n';
        Object.entries(productSummaryMap).sort((a, b) => b[1].qty - a[1].qty).forEach(([name, data]) => {
            csv += `${name};${data.qty};${data.total.toFixed(2)}\n`;
        });

        csv += '\nDETAIL DES TRANSACTIONS\n';
        csv += 'N°;Date;Produits;Montant;Paiement\n';
        transactions.forEach(t => {
            const items = t.items ? JSON.parse(t.items) : [];
            const productsStr = items.map(i => {
                const productId = i.product?.id || i.product?.localId || i.productId || i.id;
                const product = productMap[productId];
                const name = product?.name || i.name || i.productName || 'Produit';
                const qty = i.quantity || 1;
                return qty > 1 ? `${name} x${qty}` : name;
            }).join(', ');
            const payment = t.paymentMethod === 'cash' ? 'Espèces' :
                t.paymentMethod === 'card' ? 'Carte' : 'Mixte';
            csv += `${t.localId};${t.createdAt};${productsStr};${t.totalAmount.toFixed(2)};${payment}\n`;
        });

        // Append Activity Log
        csv += '\n\nJOURNAL DE CAISSE\n';
        csv += 'Date;Utilisateur;Caisse;Type;Montant;Motif\n';

        const activity = db.prepare(`
            SELECT 
                'OUVERTURE' as type, 
                c.opened_at as date,
                u.name as user_name,
                c.initial_amount as amount,
                'Fond de caisse' as reason,
                c.device_name
            FROM closures c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE DATE(c.opened_at) >= ? AND DATE(c.opened_at) <= ?
            UNION ALL
            SELECT 
                'CLOTURE' as type, 
                c.closed_at as date,
                u.name as user_name,
                c.actual_amount as amount,
                c.notes as reason,
                c.device_name
            FROM closures c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.closed_at IS NOT NULL AND DATE(c.closed_at) >= ? AND DATE(c.closed_at) <= ?
            UNION ALL
            SELECT 
                CASE WHEN m.type = 'deposit' THEN 'ENTREE' ELSE 'SORTIE' END as type,
                m.created_at as date,
                u.name as user_name,
                m.amount,
                m.reason,
                m.device_name
            FROM cash_movements m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE DATE(m.created_at) >= ? AND DATE(m.created_at) <= ?
            ORDER BY date DESC
        `).all(startDate, effectiveEndDate, startDate, effectiveEndDate, startDate, effectiveEndDate);

        activity.forEach(a => {
            csv += `${a.date};${a.user_name || '-'};${a.device_name || '-'};${a.type};${(a.amount || 0).toFixed(2)};${a.reason || '-'}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="z-caisse-${startDate}-${effectiveEndDate}.csv"`);
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8

    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Z de Caisse page
app.get('/z-caisse', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Z de Caisse - CaisseFacile ASMSP</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
            min-height: 100vh;
            color: #e2e8f0;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        h1 { font-size: 1.75rem; }
        h2 { font-size: 1.25rem; margin-bottom: 1rem; }
        .back-link { color: #3b82f6; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
        .form-section {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }
        .form-row {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            align-items: flex-end;
        }
        .form-group { flex: 1; min-width: 150px; }
        .form-group label {
            display: block;
            font-size: 0.75rem;
            color: #94a3b8;
            margin-bottom: 0.5rem;
        }
        .form-group input, .form-group select {
            width: 100%;
            padding: 0.75rem;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #e2e8f0;
            font-size: 1rem;
        }
        .btn {
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: 500;
        }
        .btn-primary {
            background: rgba(59, 130, 246, 0.8);
            color: white;
        }
        .btn-primary:hover { background: rgba(59, 130, 246, 1); }
        .btn-secondary {
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #10b981;
        }
        .btn-secondary:hover { background: rgba(16, 185, 129, 0.3); }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 1.25rem;
            text-align: center;
        }
        .stat-card h3 { font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; }
        .stat-card .value { font-size: 1.75rem; font-weight: 700; }
        .stat-card .count { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
        .stat-card.total { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); }
        .stat-card.total .value { color: #10b981; }
        .section { margin-bottom: 2rem; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        th { color: #94a3b8; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
        .amount { color: #10b981; font-weight: 600; }
        .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; }
        .badge.cash { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .badge.card { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
        .export-btns { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .hidden { display: none; }
        @media print {
            body { background: white; color: black; }
            .no-print { display: none; }
            .stat-card { border: 1px solid #ccc; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="no-print">
            <h1>Rapport Z de Caisse</h1>
            <a href="/dashboard" class="back-link">Retour au Dashboard</a>
        </header>

        <div class="form-section no-print">
            <div class="form-row">
                <div class="form-group">
                    <label>Type de rapport</label>
                    <select id="report-type" onchange="toggleDateFields()">
                        <option value="single">Jour unique</option>
                        <option value="range">Plage de dates</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="single-date">
                </div>
                <div class="form-group hidden" id="end-date-group">
                    <label>Date fin</label>
                    <input type="date" id="end-date">
                </div>
                <div class="form-group" style="flex: 0;">
                    <label>&nbsp;</label>
                    <button class="btn btn-primary" onclick="generateReport()">Generer le rapport</button>
                </div>
            </div>
        </div>

        <div id="report-content" class="hidden">
            <div class="export-btns no-print">
                <button class="btn btn-secondary" onclick="exportPDF()">Exporter PDF</button>
                <button class="btn btn-secondary" onclick="exportExcel()">Exporter Excel</button>
            </div>

            <div id="report-header" style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <h2 style="margin-bottom: 0.5rem;">CaisseFacile ASMSP - Rapport Z</h2>
                <p style="color: #94a3b8;" id="report-period"></p>
            </div>

            <div class="stats-grid" id="stats-summary"></div>

            <div class="section">
                <h2>Ventes par Produit</h2>
                <table id="products-table">
                    <thead>
                        <tr>
                            <th>Produit</th>
                            <th>Quantite</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

            <div class="section">
                <h2>Detail des Transactions</h2>
                <table id="transactions-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Produits</th>
                            <th>Montant</th>
                            <th>Paiement</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

            <div class="section">
                <h2>Journal de Caisse</h2>
                <table id="activity-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Utilisateur</th>
                            <th>Caisse</th>
                            <th>Type</th>
                            <th>Montant</th>
                            <th>Motif</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        let reportData = null;
        let currentStartDate = '';
        let currentEndDate = '';

        // Set default date to today
        document.getElementById('single-date').value = new Date().toISOString().split('T')[0];

        function toggleDateFields() {
            const type = document.getElementById('report-type').value;
            const endGroup = document.getElementById('end-date-group');
            if (type === 'range') {
                endGroup.classList.remove('hidden');
            } else {
                endGroup.classList.add('hidden');
            }
        }

        function formatPrice(n) {
            return (n || 0).toFixed(2).replace('.', ',') + ' EUR';
        }

        function formatDate(d) {
            return new Date(d).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        }

        function formatItems(items) {
            if (!items || !Array.isArray(items) || items.length === 0) {
                return '-';
            }
            return items.map(item => {
                const name = item.name || item.productName || 'Produit';
                const qty = item.quantity || 1;
                return qty > 1 ? name + ' x' + qty : name;
            }).join(', ');
        }

        async function generateReport() {
            const type = document.getElementById('report-type').value;
            currentStartDate = document.getElementById('single-date').value;
            currentEndDate = type === 'range' ? document.getElementById('end-date').value : currentStartDate;

            if (!currentStartDate) {
                alert('Veuillez selectionner une date');
                return;
            }

            try {
                const res = await fetch('/api/z-caisse?startDate=' + currentStartDate + '&endDate=' + currentEndDate);
                reportData = await res.json();

                if (reportData.error) {
                    alert('Erreur: ' + reportData.error);
                    return;
                }

                // Show report
                document.getElementById('report-content').classList.remove('hidden');

                // Period text
                const periodText = currentStartDate === currentEndDate 
                    ? 'Journee du ' + new Date(currentStartDate).toLocaleDateString('fr-FR')
                    : 'Du ' + new Date(currentStartDate).toLocaleDateString('fr-FR') + ' au ' + new Date(currentEndDate).toLocaleDateString('fr-FR');
                document.getElementById('report-period').textContent = periodText;

                // Stats summary
                const s = reportData.summary;
                document.getElementById('stats-summary').innerHTML = 
                    '<div class="stat-card"><h3>Transactions</h3><div class="value">' + s.transactionCount + '</div></div>' +
                    '<div class="stat-card"><h3>Especes</h3><div class="value">' + formatPrice(s.totalCash) + '</div><div class="count">' + s.countCash + ' transactions</div></div>' +
                    '<div class="stat-card"><h3>Carte</h3><div class="value">' + formatPrice(s.totalCard) + '</div><div class="count">' + s.countCard + ' transactions</div></div>' +
                    (s.countMixed > 0 ? '<div class="stat-card"><h3>Mixte</h3><div class="value">' + formatPrice(s.totalMixed) + '</div><div class="count">' + s.countMixed + ' transactions</div></div>' : '') +
                    '<div class="stat-card total"><h3>Total</h3><div class="value">' + formatPrice(s.total) + '</div></div>';

                // Products table
                const productsBody = document.querySelector('#products-table tbody');
                if (reportData.productSummary.length === 0) {
                    productsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">Aucun produit</td></tr>';
                } else {
                    productsBody.innerHTML = reportData.productSummary.map(p => 
                        '<tr><td>' + p.name + '</td><td>' + p.quantity + '</td><td class="amount">' + formatPrice(p.total) + '</td></tr>'
                    ).join('');
                }

                // Transactions table
                const txBody = document.querySelector('#transactions-table tbody');
                if (reportData.transactions.length === 0) {
                    txBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Aucune transaction</td></tr>';
                } else {
                    txBody.innerHTML = reportData.transactions.map(tx => 
                        '<tr><td>#' + tx.localId + '</td><td>' + formatDate(tx.createdAt) + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + formatItems(tx.items) + '</td><td class="amount">' + formatPrice(tx.totalAmount) + '</td><td><span class="badge ' + tx.paymentMethod + '">' + (tx.paymentMethod === 'cash' ? 'Especes' : 'Carte') + '</span></td></tr>'
                    ).join('');
                }

                // Activity table
                const activityBody = document.querySelector('#activity-table tbody');
                if (!reportData.activity || reportData.activity.length === 0) {
                    activityBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">Aucune activite</td></tr>';
                } else {
                    activityBody.innerHTML = reportData.activity.map(a => {
                         let badgeClass = 'badge ';
                         if (a.type === 'OUVERTURE') badgeClass += 'cash';
                         else if (a.type === 'CLOTURE') badgeClass += 'card';
                         else if (a.type === 'ENTREE') badgeClass += 'card'; 
                         else badgeClass += 'cash';

                        return '<tr><td>' + formatDate(a.date) + '</td><td>' + (a.user_name || '-') + '</td><td>' + (a.device_name || '-') + '</td><td><span class="' + badgeClass + '">' + a.type + '</span></td><td class="amount">' + formatPrice(a.amount) + '</td><td>' + (a.reason || '') + '</td></tr>';
                    }).join('');
                }

            } catch (err) {
                console.error('Error generating report:', err);
                alert('Erreur lors de la generation du rapport');
            }
        }

        async function exportExcel() {
            try {
                const res = await fetch('/api/z-caisse/export/csv?startDate=' + currentStartDate + '&endDate=' + currentEndDate);
                if (!res.ok) throw new Error('Network response was not ok');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'z-caisse-' + currentStartDate + '.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (err) {
                console.error('Export Excel error:', err);
                alert("Erreur lors de l'export Excel");
            }
        }

        function exportPDF() {
            if (!reportData) return;

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const s = reportData.summary;
            const startDate = currentStartDate;
            const endDate = currentEndDate;
            const periodText = startDate === endDate 
                ? 'Journee du ' + new Date(startDate).toLocaleDateString('fr-FR')
                : 'Du ' + new Date(startDate).toLocaleDateString('fr-FR') + ' au ' + new Date(endDate).toLocaleDateString('fr-FR');

            // Header - Colored Bar
            doc.setFillColor(30, 41, 59); // #1e293b
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.text('CaisseFacile ASMSP', 14, 15);
            doc.setFontSize(14);
            doc.text('RAPPORT Z DE CAISSE', 14, 25);
            
            doc.setFontSize(10);
            doc.text(periodText.toUpperCase(), 14, 34);
            doc.text('GENERE LE : ' + new Date().toLocaleString('fr-FR').toUpperCase(), 200, 34, { align: 'right' });

            doc.setTextColor(0, 0, 0);
            let y = 50;

            // Summary Table
            doc.setFontSize(14);
            doc.text('RESUME DES VENTES', 14, y);
            
            doc.autoTable({
                startY: y + 5,
                head: [['Type', 'Nombre', 'Montant']],
                body: [
                    ['Ventes Especes', s.countCash, formatPrice(s.totalCash)],
                    ['Ventes Carte', s.countCard, formatPrice(s.totalCard)],
                    ...(s.countMixed > 0 ? [['Ventes Mixtes', s.countMixed, formatPrice(s.totalMixed)]] : []),
                    [{ content: 'TOTAL GENERAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
                     { content: s.transactionCount, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
                     { content: formatPrice(s.total), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }]
                ],
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59] },
                margin: { left: 14, right: 14 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // Products Table
            doc.setFontSize(14);
            doc.text('VENTES PAR PRODUIT', 14, y);
            
            doc.autoTable({
                startY: y + 5,
                head: [['Produit', 'Quantite', 'Total']],
                body: reportData.productSummary.map(p => [p.name, p.quantity, formatPrice(p.total)]),
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59] },
                margin: { left: 14, right: 14 }
            });

            y = doc.lastAutoTable.finalY + 15;
            if (y > 240) { doc.addPage(); y = 20; }

            // Transactions Table
            doc.setFontSize(14);
            doc.text('DETAIL DES TRANSACTIONS', 14, y);
            
            doc.autoTable({
                startY: y + 5,
                head: [['#', 'Date', 'Produits', 'Montant', 'Paiement']],
                body: reportData.transactions.map(tx => [
                    '#' + tx.localId,
                    formatDate(tx.createdAt),
                    formatItems(tx.items),
                    formatPrice(tx.totalAmount),
                    tx.paymentMethod === 'cash' ? 'Especes' : 'Carte'
                ]),
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59] },
                margin: { left: 14, right: 14 },
                columnStyles: {
                    2: { cellWidth: 80 }
                }
            });

            y = doc.lastAutoTable.finalY + 15;
            if (y > 240) { doc.addPage(); y = 20; }

            // Activity Log Table
            doc.setFontSize(14);
            doc.text('JOURNAL DE CAISSE', 14, y);
            
            doc.autoTable({
                startY: y + 5,
                head: [['Date', 'Caisse', 'Type', 'Montant', 'Motif']],
                body: (reportData.activity || []).map(a => [
                    formatDate(a.date),
                    a.device_name || '-',
                    a.type,
                    formatPrice(a.amount),
                    a.reason || '-'
                ]),
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59] },
                margin: { left: 14, right: 14 }
            });

            const filename = 'z-caisse-' + currentStartDate + '.pdf';
            doc.save(filename);
        }
    </script>
</body>
</html>`);
});

// ===================================
// Admin Actions
// ===================================

app.post('/api/admin/clear-data', (req, res) => {
    try {
        console.log('[Admin] Clearing all sales data...');

        // Execute in transaction to ensure all or nothing
        const clearData = db.transaction(() => {
            // Delete all transactions
            db.prepare('DELETE FROM transactions').run();

            // Delete all closures
            db.prepare('DELETE FROM closures').run();

            // Delete sync logs related to these entities
            db.prepare("DELETE FROM sync_log WHERE entity_type IN ('transaction', 'closure')").run();
        });

        clearData();

        console.log('[Admin] All sales data cleared successfully');
        res.json({ success: true, message: 'Données de vente supprimées avec succès' });
    } catch (error) {
        console.error('Clear data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Start Server
// ===================================

app.listen(PORT, () => {
    console.log(`
========================================
  CaisseFacile ASMSP - Backend Server
========================================
  API:       http://localhost:${PORT}/api
  Dashboard: http://localhost:${PORT}/dashboard
  Health:    http://localhost:${PORT}/api/health
========================================
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    db.close();
    process.exit(0);
});
// Deploy test Wed Jan 14 15:48:10 CET 2026
