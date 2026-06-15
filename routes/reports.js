const express = require('express');
const router = express.Router();
const { dbAll, dbGet } = require('../db/connection');
const { getLocalTodayDate } = require('../utils/helpers');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API LAPORAN & STATISTIK ====================

// Ringkasan Dashboard (Halaman utama)
router.get('/api/dashboard/summary', async (req, res) => {
  try {
    const { owner } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';
    const today = getLocalTodayDate();

    let todayOmset, todayProfit, topProducts, lowStockCount;

    if (hasOwner) {
      todayOmset = await dbGet(`
        SELECT SUM(ti.subtotal) as total, COUNT(DISTINCT ti.transaction_id) as count 
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      todayProfit = await dbGet(`
        SELECT SUM((ti.price_sell - p.price_buy) * ti.quantity) as profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      topProducts = await dbAll(`
        SELECT product_name, SUM(quantity) as total_sold
        FROM transaction_items
        WHERE product_owner = ?
        GROUP BY product_id, product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `, [owner]);

      lowStockCount = await dbGet(`
        SELECT COUNT(*) as count FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) AND owner = ?
      `, [owner]);
    } else {
      todayOmset = await dbGet(`
        SELECT SUM(total_amount) as total, COUNT(*) as count 
        FROM transactions 
        WHERE date(created_at, 'localtime') = ?
      `, [today]);

      todayProfit = await dbGet(`
        SELECT SUM((ti.price_sell - p.price_buy) * ti.quantity) as profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ?
      `, [today]);

      topProducts = await dbAll(`
        SELECT product_name, SUM(quantity) as total_sold
        FROM transaction_items
        GROUP BY product_id, product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `);

      lowStockCount = await dbGet(`
        SELECT COUNT(*) as count FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL)
      `);
    }

    res.json({
      today_revenue: todayOmset.total || 0,
      today_transactions: todayOmset.count || 0,
      today_profit: todayProfit.profit || 0,
      low_stock_alerts: lowStockCount.count || 0,
      top_products: topProducts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Penjualan Hari Ini (mendukung filter date, cashier, dan owner)
router.get('/api/reports/today', async (req, res) => {
  try {
    const { owner, date, cashier } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null' && owner !== '';
    const hasCashier = cashier && cashier !== 'All' && cashier !== 'undefined' && cashier !== 'null' && cashier !== '';
    const targetDate = date || getLocalTodayDate();
    
    let summary, profitData, soldItems, transactions;

    if (hasOwner) {
      let sumSql = `
        SELECT 
          SUM(ti.subtotal) as total_revenue,
          COUNT(DISTINCT ti.transaction_id) as total_transactions,
          0 as total_discount,
          0 as total_tax
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `;
      let sumParams = [targetDate, owner];
      if (hasCashier) {
        sumSql += ' AND t.cashier_name = ?';
        sumParams.push(cashier);
      }
      summary = await dbGet(sumSql, sumParams);

      let profitSql = `
        SELECT SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `;
      let profitParams = [targetDate, owner];
      if (hasCashier) {
        profitSql += ' AND t.cashier_name = ?';
        profitParams.push(cashier);
      }
      profitData = await dbGet(profitSql, profitParams);

      let soldSql = `
        SELECT 
          ti.product_name,
          SUM(ti.quantity) as qty_sold,
          ti.price_sell,
          SUM(ti.subtotal) as total_sales
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `;
      let soldParams = [targetDate, owner];
      if (hasCashier) {
        soldSql += ' AND t.cashier_name = ?';
        soldParams.push(cashier);
      }
      soldSql += ' GROUP BY ti.product_id, ti.product_name ORDER BY qty_sold DESC';
      soldItems = await dbAll(soldSql, soldParams);

      let txSql = `
        SELECT t.id, t.invoice_number, t.cashier_name, t.payment_method, 
               SUM(ti.subtotal) as total_amount, 0 as discount, 0 as tax, 
               SUM(ti.subtotal) as payment_amount, 0 as change_amount, t.created_at
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `;
      let txParams = [targetDate, owner];
      if (hasCashier) {
        txSql += ' AND t.cashier_name = ?';
        txParams.push(cashier);
      }
      txSql += ' GROUP BY t.id ORDER BY t.created_at DESC';
      transactions = await dbAll(txSql, txParams);
      
    } else {
      let sumSql = `
        SELECT 
          SUM(total_amount) as total_revenue,
          COUNT(*) as total_transactions,
          SUM(discount) as total_discount,
          SUM(tax) as total_tax
        FROM transactions
        WHERE date(created_at, 'localtime') = ?
      `;
      let sumParams = [targetDate];
      if (hasCashier) {
        sumSql += ' AND cashier_name = ?';
        sumParams.push(cashier);
      }
      summary = await dbGet(sumSql, sumParams);

      let profitSql = `
        SELECT SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ?
      `;
      let profitParams = [targetDate];
      if (hasCashier) {
        profitSql += ' AND t.cashier_name = ?';
        profitParams.push(cashier);
      }
      profitData = await dbGet(profitSql, profitParams);

      let soldSql = `
        SELECT 
          product_name,
          SUM(quantity) as qty_sold,
          price_sell,
          SUM(subtotal) as total_sales
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ?
      `;
      let soldParams = [targetDate];
      if (hasCashier) {
        soldSql += ' AND t.cashier_name = ?';
        soldParams.push(cashier);
      }
      soldSql += ' GROUP BY product_id, product_name ORDER BY qty_sold DESC';
      soldItems = await dbAll(soldSql, soldParams);

      let txSql = `
        SELECT * FROM transactions 
        WHERE date(created_at, 'localtime') = ?
      `;
      let txParams = [targetDate];
      if (hasCashier) {
        txSql += ' AND cashier_name = ?';
        txParams.push(cashier);
      }
      txSql += ' ORDER BY created_at DESC';
      transactions = await dbAll(txSql, txParams);
    }

    res.json({
      date: targetDate,
      revenue: summary.total_revenue || 0,
      transactions_count: summary.total_transactions || 0,
      discount: summary.total_discount || 0,
      tax: summary.total_tax || 0,
      profit: profitData.total_profit || 0,
      sold_items: soldItems,
      transactions: transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Stok Barang
router.get('/api/reports/products', async (req, res) => {
  try {
    const { owner } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';

    let stats, lowStockList, allProducts;

    if (hasOwner) {
      stats = await dbGet(`
        SELECT 
          COUNT(*) as total_skus,
          SUM(stock) as total_stock,
          SUM(stock * price_buy) as total_asset_buy,
          SUM(stock * price_sell) as total_asset_sell
        FROM products
        WHERE owner = ?
      `, [owner]);

      lowStockList = await dbAll(`
        SELECT * FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) AND owner = ? ORDER BY stock ASC
      `, [owner]);

      allProducts = await dbAll(`
        SELECT *, (stock * price_buy) as asset_value_buy, (stock * price_sell) as asset_value_sell
        FROM products
        WHERE owner = ?
        ORDER BY stock ASC, name ASC
      `, [owner]);
    } else {
      stats = await dbGet(`
        SELECT 
          COUNT(*) as total_skus,
          SUM(stock) as total_stock,
          SUM(stock * price_buy) as total_asset_buy,
          SUM(stock * price_sell) as total_asset_sell
        FROM products
      `);

      lowStockList = await dbAll(`
        SELECT * FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) ORDER BY stock ASC
      `);

      allProducts = await dbAll(`
        SELECT *, (stock * price_buy) as asset_value_buy, (stock * price_sell) as asset_value_sell
        FROM products
        ORDER BY stock ASC, name ASC
      `);
    }

    res.json({
      total_skus: stats.total_skus || 0,
      total_items: stats.total_stock || 0,
      asset_value_cost: stats.total_asset_buy || 0,
      asset_value_retail: stats.total_asset_sell || 0,
      low_stock_products: lowStockList,
      products: allProducts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Keuangan berbasis Rentang Tanggal
router.get('/api/reports/finance', async (req, res) => {
  const { startDate, endDate, owner } = req.query;
  const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parameter startDate dan endDate wajib disertakan (Format: YYYY-MM-DD)' });
  }

  try {
    let summary, profitData, dailyData, paymentBreakdown, cashierBreakdown, categoryBreakdown, totalExpenses;

    if (hasOwner) {
      summary = await dbGet(`
        SELECT 
          SUM(ti.subtotal) as total_revenue,
          0 as total_discount,
          0 as total_tax,
          COUNT(DISTINCT ti.transaction_id) as total_transactions
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
      `, [startDate, endDate, owner]);

      profitData = await dbGet(`
        SELECT 
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as total_hpp
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
      `, [startDate, endDate, owner]);

      dailyData = await dbAll(`
        SELECT 
          date(t.created_at, 'localtime') as trans_date,
          COUNT(DISTINCT t.id) as trans_count,
          SUM(ti.subtotal) as revenue,
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as hpp
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY trans_date
        ORDER BY trans_date ASC
      `, [startDate, endDate, owner]);

      paymentBreakdown = await dbAll(`
        SELECT t.payment_method, SUM(ti.subtotal) as amount, COUNT(DISTINCT t.id) as count
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY t.payment_method
      `, [startDate, endDate, owner]);

      cashierBreakdown = await dbAll(`
        SELECT t.cashier_name, SUM(ti.subtotal) as amount, COUNT(DISTINCT t.id) as count
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY t.cashier_name
      `, [startDate, endDate, owner]);

      const expenseRow = await dbGet(`
        SELECT SUM(amount) as total FROM expenses
        WHERE expense_date BETWEEN ? AND ? AND owner = ?
      `, [startDate, endDate, owner]);
      totalExpenses = expenseRow.total || 0;

      categoryBreakdown = await dbAll(`
        SELECT 
          COALESCE(p.category, 'Lainnya') as category,
          SUM(ti.subtotal) as amount,
          SUM(ti.quantity) as quantity
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY category
        ORDER BY amount DESC
      `, [startDate, endDate, owner]);

    } else {
      summary = await dbGet(`
        SELECT 
          SUM(total_amount) as total_revenue,
          SUM(discount) as total_discount,
          SUM(tax) as total_tax,
          COUNT(*) as total_transactions
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
      `, [startDate, endDate]);

      profitData = await dbGet(`
        SELECT 
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as total_hpp
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
      `, [startDate, endDate]);

      dailyData = await dbAll(`
        SELECT 
          date(t.created_at, 'localtime') as trans_date,
          COUNT(DISTINCT t.id) as trans_count,
          SUM(t.total_amount) as revenue,
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as hpp
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY trans_date
        ORDER BY trans_date ASC
      `, [startDate, endDate]);

      paymentBreakdown = await dbAll(`
        SELECT payment_method, SUM(total_amount) as amount, COUNT(*) as count
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY payment_method
      `, [startDate, endDate]);

      cashierBreakdown = await dbAll(`
        SELECT cashier_name, SUM(total_amount) as amount, COUNT(*) as count
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY cashier_name
      `, [startDate, endDate]);

      const expenseRow = await dbGet(`
        SELECT SUM(amount) as total FROM expenses
        WHERE expense_date BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalExpenses = expenseRow.total || 0;

      categoryBreakdown = await dbAll(`
        SELECT 
          COALESCE(p.category, 'Lainnya') as category,
          SUM(ti.subtotal) as amount,
          SUM(ti.quantity) as quantity
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY category
        ORDER BY amount DESC
      `, [startDate, endDate]);
    }

    const grossProfit = (summary.total_revenue || 0) - (profitData.total_hpp || 0) - (summary.total_discount || 0);

    res.json({
      summary: {
        revenue: summary.total_revenue || 0,
        discount: summary.total_discount || 0,
        tax: summary.total_tax || 0,
        transactions_count: summary.total_transactions || 0,
        hpp: profitData.total_hpp || 0,
        profit: grossProfit,
        expenses: totalExpenses,
        net_profit: grossProfit - totalExpenses
      },
      daily: dailyData,
      payment_breakdown: paymentBreakdown,
      cashier_breakdown: cashierBreakdown,
      category_breakdown: categoryBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
