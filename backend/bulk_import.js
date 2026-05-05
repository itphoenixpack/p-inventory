const { Pool } = require('pg');

// DATABASE CONFIGURATION
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'inventory_system',
    password: 'root',
    port: 5432,
});

/**
 * PASTE YOUR EXCEL DATA HERE
 * Format: [ [Product Name, Warehouse ID, Shelf Pin], ... ]
 * Warehouse IDs: 1 = Warehouse 2, 2 = Warehouse 3
 */
const dataToImport = [
    // ["Product Name", WarehouseID, "ShelfPin"],
];


async function bulkImport() {
    if (dataToImport.length === 0) {
        console.error("❌ ERROR: No data found in 'dataToImport' array. Please paste your data first.");
        process.exit(1);
    }

    console.log(`🚀 Starting bulk import of ${dataToImport.length} items...`);
    let successCount = 0;
    let errorCount = 0;

    for (const [name, warehouse_id, shelf_code] of dataToImport) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Generate internal metadata
            const sku = `PHX-${Date.now().toString().slice(-6)}-${successCount}`;
            const description = "Bulk imported from Excel";

            // 2. Insert Product
            const productRes = await client.query(
                'INSERT INTO products (name, sku, description) VALUES ($1, $2, $3) RETURNING id',
                [name, sku, description]
            );
            const productId = productRes.rows[0].id;

            // 3. Insert Inventory
            await client.query(
                'INSERT INTO inventory (product_id, warehouse_id, quantity, shelf_code) VALUES ($1, $2, $3, $4)',
                [productId, parseInt(warehouse_id), 0, shelf_code]
            );

            await client.query('COMMIT');
            successCount++;
            console.log(`✅ Success: ${name} (Warehouse: ${warehouse_id}, Shelf: ${shelf_code})`);
        } catch (err) {
            await client.query('ROLLBACK');
            errorCount++;
            console.error(`❌ FAILED: ${name} - Error: ${err.message}`);
        } finally {
            client.release();
        }
    }

    console.log("\n--- IMPORT SUMMARY ---");
    console.log(`TOTAL PROCESSED: ${dataToImport.length}`);
    console.log(`SUCCESSFUL:      ${successCount}`);
    console.log(`FAILED:          ${errorCount}`);
    console.log("----------------------");

    await pool.end();
}

bulkImport();
