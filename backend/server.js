// ===================================
// Ma Caisse AG - Backend API Server
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
        expected_amount REAL NOT NULL,
        actual_amount REAL,
        difference REAL,
        notes TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(local_id, opened_at)
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

console.log('✅ Database initialized');

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
    console.log(`[Database] ✅ Seeded ${INITIAL_PRODUCTS.length} products.`);
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
    console.log(`[Database] ✅ Seeded ${INITIAL_USERS.length} users.`);
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

} catch (e) {
    console.warn('[Migration Warning]', e.message);
}

// ===================================
// Express App Setup
// ===================================

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

// Serve static uploads with correct MIME types
console.log('📂 Serving uploads from:', uploadsPath);
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
            INSERT OR REPLACE INTO closures 
            (local_id, user_id, opened_at, closed_at, expected_amount, actual_amount, difference, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                    c.notes || null
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

// Get current session data for closure
app.get('/api/closure/current-session', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Get today's transactions
        const transactions = db.prepare(`
            SELECT 
                id, user_id as userId, total_amount as totalAmount, 
                payment_method as paymentMethod, cash_received as cashReceived,
                change_given as changeGiven, created_at as createdAt
            FROM transactions 
            WHERE DATE(created_at) = ?
            ORDER BY created_at DESC
        `).all(today);

        // Calculate totals by payment method
        let totalCash = 0;
        let totalCard = 0;
        let totalMixed = 0;
        let transactionCount = transactions.length;

        transactions.forEach(t => {
            const amount = t.totalAmount;
            if (t.paymentMethod === 'cash') {
                totalCash += amount;
            } else if (t.paymentMethod === 'card') {
                totalCard += amount;
            } else if (t.paymentMethod === 'mixed') {
                totalMixed += amount;
            }
        });

        const total = totalCash + totalCard + totalMixed;

        res.json({
            transactionCount,
            totalCash,
            totalCard,
            totalMixed,
            total,
            transactions: transactions.map(t => ({
                ...t,
                createdAt: new Date(t.createdAt)
            }))
        });

    } catch (error) {
        console.error('Get current session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save closure
app.post('/api/closures', (req, res) => {
    try {
        const { userId, expectedAmount, actualAmount, notes } = req.body;

        if (!userId || expectedAmount === undefined || actualAmount === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = new Date().toISOString();
        const localId = Date.now();
        const difference = actualAmount - expectedAmount;

        // Insert closure
        db.prepare(`
            INSERT INTO closures 
            (local_id, user_id, opened_at, closed_at, expected_amount, actual_amount, difference, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            localId,
            userId,
            now, // For simplicity, using same timestamp for opened_at
            now,
            expectedAmount,
            actualAmount,
            difference,
            notes || null
        );

        res.json({
            success: true,
            closure: {
                id: localId,
                userId,
                expectedAmount,
                actualAmount,
                difference,
                notes,
                closedAt: now
            }
        });

    } catch (error) {
        console.error('Save closure error:', error);
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

        res.json({
            transactions: transactions.map(t => ({
                ...t,
                items: t.items ? JSON.parse(t.items) : [],
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
    <title>Ma Caisse AG - Dashboard</title>
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
            <h1>⚽ Ma Caisse AG - Dashboard</h1>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <span class="status online" id="status">● En ligne</span>
                <button class="refresh-btn" onclick="loadData()">↻ Actualiser</button>
            </div>
        </header>

        <div class="stats-grid" id="stats">
            <div class="stat-card">
                <h3>💰 CA Aujourd'hui</h3>
                <div class="value" id="today-sales">--</div>
                <div class="sub" id="today-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>📊 CA Semaine</h3>
                <div class="value" id="week-sales">--</div>
                <div class="sub" id="week-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>📅 CA Mois</h3>
                <div class="value" id="month-sales">--</div>
                <div class="sub" id="month-count">-- transactions</div>
            </div>
            <div class="stat-card">
                <h3>💵 Espèces (Aujourd'hui)</h3>
                <div class="value" id="today-cash">--</div>
            </div>
        </div>

        <div class="section">
            <h2>🧾 Dernières Transactions</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Montant</th>
                        <th>Paiement</th>
                    </tr>
                </thead>
                <tbody id="transactions-table">
                    <tr><td colspan="4" style="text-align:center;">Chargement...</td></tr>
                </tbody>
            </table>
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

        async function loadData() {
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

                const txRes = await fetch('/api/transactions?limit=20');
                const result = await txRes.json();
                const transactions = result.transactions || [];

                const tbody = document.getElementById('transactions-table');
                if (transactions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#64748b;">Aucune transaction</td></tr>';
                } else {
                    tbody.innerHTML = transactions.map(tx => \`
                        <tr>
                            <td>#\${tx.localId || tx.local_id}</td>
                            <td>\${formatDate(tx.createdAt || tx.created_at)}</td>
                            <td class="amount">\${formatPrice(tx.totalAmount || tx.total_amount)}</td>
                            <td><span class="badge \${tx.paymentMethod || tx.payment_method}">\${(tx.paymentMethod || tx.payment_method) === 'cash' ? 'Espèces' : 'Carte'}</span></td>
                        </tr>
                    \`).join('');
                }
            } catch (err) {
                console.error('Error loading data:', err);
                document.getElementById('status').className = 'status';
                document.getElementById('status').textContent = '● Erreur';
            }
        }

        loadData();
        setInterval(loadData, 30000);
    </script>
</body>
</html>`);
});

// ===================================
// Start Server
// ===================================

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     ⚽ Ma Caisse AG - Backend Server             ║
╠══════════════════════════════════════════════════╣
║  API:       http://localhost:${PORT}/api          ║
║  Dashboard: http://localhost:${PORT}/dashboard    ║
║  Health:    http://localhost:${PORT}/api/health   ║
╚══════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    db.close();
    process.exit(0);
});
// Deploy test Wed Jan 14 15:48:10 CET 2026
