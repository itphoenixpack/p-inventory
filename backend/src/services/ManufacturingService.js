const BaseService = require('./BaseService');
const path = require('path');
const fs = require('fs');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

// Status flow: which transitions are allowed
const ALLOWED_TRANSITIONS = {
  not_started: ['active', 'closed'],
  active:      ['not_started', 'closed'],
  closed:      ['active', 'not_started'],
};

class ManufacturingService extends BaseService {
  constructor(projectRepository, itemRepository, inventoryItemRepository, knex) {
    super(projectRepository);
    this.itemRepository = itemRepository;
    this.inventoryItemRepository = inventoryItemRepository;
    this.knex = knex;
  }

  _checkAccess(project, user) {
    if (!project) throw { statusCode: 404, message: 'Project not found.' };
    const isAdmin = ['admin', 'super_admin'].includes(user?.role);
    const isOwner = project.created_by === user?.id;
    
    if (!isAdmin && !isOwner) {
      throw { statusCode: 403, message: 'You do not have permission to modify this project. Only the creator or an administrator can perform this action.' };
    }
  }


  // ──────────────────────────────────────────────────────────────
  // PROJECTS
  // ──────────────────────────────────────────────────────────────

  async createProject({ machine_name, note = null, budget = 0 }, userId) {
    if (!machine_name || !machine_name.trim()) {
      throw { statusCode: 400, message: 'Machine name is required.' };
    }
    return this.repository.create({
      machine_name: machine_name.trim(),
      status: 'not_started',
      note: note || null,
      budget: parseFloat(budget) || 0,
      created_by: userId
    });
  }

  async updateProject(id, { machine_name, note, budget }, user) {
    const project = await this.repository.findById(id);
    this._checkAccess(project, user);
    

    const updateData = {};
    if (machine_name !== undefined) updateData.machine_name = machine_name.trim();
    if (note !== undefined) updateData.note = note || null;
    if (budget !== undefined) updateData.budget = parseFloat(budget) || 0;
    updateData.updated_at = new Date();

    return this.repository.update(id, updateData);
  }

  async getAllProjects() {
    return this.repository.findAllWithCost();
  }

  async getProjectDetail(id) {
    const project = await this.repository.findWithItems(id);
    if (!project) throw { statusCode: 404, message: 'Manufacturing project not found.' };
    return project;
  }

  async updateStatus(id, newStatus, user) {
    const project = await this.repository.findById(id);
    this._checkAccess(project, user);

    const allowed = ALLOWED_TRANSITIONS[project.status] || [];
    if (!allowed.includes(newStatus)) {
      throw {
        statusCode: 400,
        message: `Invalid status transition: '${project.status}' → '${newStatus}'. Allowed: ${allowed.length ? allowed.join(', ') : 'none (project is closed).'}`
      };
    }

    return this.repository.update(id, { status: newStatus, updated_at: new Date() });
  }

  async deleteProject(id, user) {
    const project = await this.repository.findById(id);
    this._checkAccess(project, user);
    return this.repository.delete(id);
  }

  // ──────────────────────────────────────────────────────────────
  // BILL OF MATERIALS OPERATIONS (INTEGRATED WITH STOCK)
  // ──────────────────────────────────────────────────────────────


  async addItemToProject(projectId, productId, quantityUsed, cost, user) {
    quantityUsed = parseFloat(quantityUsed);
    cost = parseFloat(cost) || 0;
    if (!quantityUsed || quantityUsed <= 0) {
      throw { statusCode: 400, message: 'Quantity must be greater than 0.' };
    }

    const project = await this.repository.findById(projectId);
    this._checkAccess(project, user);

    return this.knex.transaction(async (trx) => {
      // 1. Fetch item and total stock
      const product = await this.knex('products')
        .transacting(trx)
        .where({ id: productId })
        .forUpdate()
        .first();

      if (!product) throw { statusCode: 404, message: 'Item not found in catalog.' };

      const stocks = await this.knex('stock')
        .transacting(trx)
        .where({ product_id: productId })
        .orderBy('quantity', 'desc')
        .forUpdate();

      const totalAvail = stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0);

      if (totalAvail < quantityUsed) {
        throw {
          statusCode: 400,
          message: `Insufficient stock for "${product.name}". Total available across warehouses: ${totalAvail}, requested: ${quantityUsed}.`,
        };
      }

      // 2. Deduct from warehouses (FIFO-ish, highest quantity first)
      let remainingToDeduct = quantityUsed;
      for (const stockRecord of stocks) {
        if (remainingToDeduct <= 0) break;
        
        const deductFromThis = Math.min(parseFloat(stockRecord.quantity), remainingToDeduct);
        
        await this.knex('stock')
          .transacting(trx)
          .where({ id: stockRecord.id })
          .update({ 
            quantity: this.knex.raw('quantity - ?', [deductFromThis]), 
            updated_at: this.knex.fn.now() 
          });

        // Record transaction for audit
        await this.knex('inventory_transactions')
          .transacting(trx)
          .insert({
            product_id: productId,
            warehouse_name: stockRecord.warehouse_name,
            shelf_code: stockRecord.shelf_code,
            quantity: -deductFromThis,
            type: 'OUT',
            user_id: user.id,
            notes: `Consumption for Manufacturing Project #${projectId}`
          });

        remainingToDeduct -= deductFromThis;
      }

      // 3. Update Bill of Materials (manufacturing_items)
      const existing = await this.knex('manufacturing_items')
        .transacting(trx)
        .where({ project_id: projectId, product_id: productId })
        .first();

      if (existing) {
        const newQtyUsed = parseFloat(existing.quantity_used) + quantityUsed;
        await this.knex('manufacturing_items')
          .transacting(trx)
          .where({ id: existing.id })
          .update({ quantity_used: newQtyUsed, cost: cost });
        return { ...existing, quantity_used: newQtyUsed, cost: cost };
      } else {
        const [row] = await this.knex('manufacturing_items')
          .transacting(trx)
          .insert({ project_id: projectId, product_id: productId, quantity_used: quantityUsed, cost: cost })
          .returning('*');
        return row[0] || row;
      }
    });
  }

  async removeItemFromProject(projectId, bomItemId, user) {
    const project = await this.repository.findById(projectId);
    this._checkAccess(project, user);

    return this.knex.transaction(async (trx) => {

      const bomRow = await this.knex('manufacturing_items')
        .transacting(trx)
        .where({ id: bomItemId, project_id: projectId })
        .first();
      if (!bomRow) throw { statusCode: 404, message: 'BOM item not found.' };

      // Restore stock - we'll restore to the warehouse it was most likely taken from, or just the first one
      const stockRecord = await this.knex('stock')
        .transacting(trx)
        .where({ product_id: bomRow.product_id })
        .first() || await this.knex('stock')
          .transacting(trx)
          .insert({ product_id: bomRow.product_id, warehouse_name: 'Main warehouse', quantity: 0 })
          .returning('*')
          .then(rows => rows[0]);

      await this.knex('stock')
        .transacting(trx)
        .where({ id: stockRecord.id })
        .update({ 
          quantity: this.knex.raw('quantity + ?', [parseFloat(bomRow.quantity_used)]), 
          updated_at: this.knex.fn.now() 
        });

      // Record transaction
      await this.knex('inventory_transactions')
        .transacting(trx)
        .insert({
          product_id: bomRow.product_id,
          warehouse_name: stockRecord.warehouse_name,
          quantity: parseFloat(bomRow.quantity_used),
          type: 'IN',
          user_id: user.id,
          notes: `Restored from deleted Manufacturing Project #${projectId}`
        });

      await this.knex('manufacturing_items')
        .transacting(trx)
        .where({ id: bomItemId })
        .del();

      return { deleted: true };
    });
  }

  async updateItemQuantity(projectId, bomItemId, newQuantity, newCost, user) {
    newQuantity = parseFloat(newQuantity);
    if (newQuantity <= 0) throw { statusCode: 400, message: 'Quantity must be greater than 0.' };
    const cost = newCost !== undefined ? parseFloat(newCost) : undefined;
    
    const project = await this.repository.findById(projectId);
    this._checkAccess(project, user);

    return this.knex.transaction(async (trx) => {
      const bomRow = await this.knex('manufacturing_items')
        .transacting(trx)
        .where({ id: bomItemId, project_id: projectId })
        .forUpdate()
        .first();

      if (!bomRow) throw { statusCode: 404, message: 'BOM item not found.' };

      const diff = newQuantity - parseFloat(bomRow.quantity_used);
      if (diff === 0) return bomRow;

      if (diff > 0) {
        // Deduct more stock
        const stocks = await this.knex('stock')
          .transacting(trx)
          .where({ product_id: bomRow.product_id })
          .orderBy('quantity', 'desc')
          .forUpdate();

        const totalAvail = stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0);
        if (totalAvail < diff) throw { statusCode: 400, message: 'Insufficient stock for adjustment.' };

        let remainingToDeduct = diff;
        for (const s of stocks) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(parseFloat(s.quantity), remainingToDeduct);
          await this.knex('stock').transacting(trx).where({ id: s.id }).update({ quantity: this.knex.raw('quantity - ?', [deduct]) });
          
          await this.knex('inventory_transactions')
            .transacting(trx)
            .insert({
              product_id: bomRow.product_id,
              warehouse_name: s.warehouse_name,
              quantity: -deduct,
              type: 'OUT',
              user_id: user.id,
              notes: `Additional consumption for Project #${projectId} (Adjustment)`
            });

          remainingToDeduct -= deduct;
        }
      } else {
        // Restore stock
        const restoreQty = Math.abs(diff);
        // Try to find a stock record for this product to restore to
        const stockRecord = await this.knex('stock')
          .transacting(trx)
          .where({ product_id: bomRow.product_id })
          .first();
        
        const targetWarehouse = stockRecord ? stockRecord.warehouse_name : 'Main warehouse';
        
        if (stockRecord) {
          await this.knex('stock').transacting(trx).where({ id: stockRecord.id }).update({ quantity: this.knex.raw('quantity + ?', [restoreQty]) });
        } else {
          await this.knex('stock').transacting(trx).insert({
            product_id: bomRow.product_id,
            warehouse_name: targetWarehouse,
            quantity: restoreQty
          });
        }

        await this.knex('inventory_transactions')
          .transacting(trx)
          .insert({
            product_id: bomRow.product_id,
            warehouse_name: targetWarehouse,
            quantity: restoreQty,
            type: 'IN',
            user_id: user.id,
            notes: `Restored from Project #${projectId} (Adjustment)`
          });
      }

      const updateData = { quantity_used: newQuantity };
      if (cost !== undefined) updateData.cost = cost;

      const updated = await this.knex('manufacturing_items')
        .transacting(trx)
        .where({ id: bomItemId })
        .update(updateData)
        .returning('*');

      return updated[0];
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PDF REPORT
  // ──────────────────────────────────────────────────────────────

  async generatePdfReport(projectId) {
    const project = await this.repository.findWithItems(projectId);
    if (!project) throw { statusCode: 404, message: 'Project not found.' };
    if (project.status !== 'closed') {
      throw { statusCode: 403, message: 'PDF report is only available for closed projects.' };
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Logo
    const logoPath = path.join(__dirname, '../../..', 'frontend/src/assets/inpack-logo.png');
    if (fs.existsSync(logoPath)) {
      const logoData = fs.readFileSync(logoPath);
      const base64Logo = `data:image/png;base64,${logoData.toString('base64')}`;
      doc.addImage(base64Logo, 'PNG', 14, 10, 40, 18);
    }

    // ── Header
    doc.setFontSize(20);
    doc.setTextColor(10, 36, 99);
    doc.setFont('helvetica', 'bold');
    doc.text('Inpack — Manufacturing Report', 60, 20);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 60, 26);

    // ── Project Info box
    doc.setFillColor(245, 247, 252);
    doc.roundedRect(14, 34, 182, 28, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text('Machine Name:', 18, 43);
    doc.setFont('helvetica', 'normal');
    doc.text(project.machine_name, 55, 43);

    doc.setFont('helvetica', 'bold');
    doc.text('Status:', 18, 51);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(22, 163, 74);
    doc.text('CLOSED', 55, 51);

    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 110, 43);
    doc.setFont('helvetica', 'normal');
    const noteText = project.note || '—';
    doc.text(doc.splitTextToSize(noteText, 80), 128, 43);

    // ── Bill of Materials table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 36, 99);
    doc.text('Bill of Materials', 14, 72);

    const tableRows = project.items.map((item, i) => [
      i + 1,
      item.item_name,
      item.category === 'spare_part' ? 'Spare Part' : 'Raw Material',
      `${item.quantity_used} ${item.unit || 'pcs'}`,
    ]);

    autoTable.default(doc, {
      startY: 76,
      head: [['#', 'Item Name', 'Category', 'Qty Used']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [10, 36, 99], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 30 },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
      },
    });

    // ── Footer
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.setFont('helvetica', 'normal');
    doc.text('Generated by Inpack Manufacturing System', 14, 285);
    doc.text(`Page 1`, 196, 285, { align: 'right' });

    return Buffer.from(doc.output('arraybuffer'));
  }
}

module.exports = ManufacturingService;
