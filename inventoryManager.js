import { EventEmitter } from "events";
import fs from "fs/promises";

class AppError extends Error {
  constructor(message, code = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export default class InventoryManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
  }

  async logTransactionLog(text) {
    const time = new Date().toISOString();
    await fs
      .appendFile("transactions.log", `[${time}] ${text}\n`)
      .catch(() => {});
  }

  async addProduct(productId, name, price, stock, category) {
    if (!productId || !name) throw new AppError("ID dan nama wajib diisi", 422);
    if (price < 0 || stock < 0)
      throw new AppError("Harga/stok tidak boleh negatif", 422);

    const sql = `INSERT INTO products (id, name, price, stock, category, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`;
    await this.db.execute(sql, [productId, name, price, stock, category]);

    await this.logTransactionLog(
      `ADD PRODUCT ${productId} ${name} price:${price} stock:${stock}`
    );
    return { productId };
  }

  async updateStock(productId, quantity, transactionType) {
    if (!productId) throw new AppError("ProdukId harus ada", 422);
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new AppError("Jumlah harus > 0", 422);

    const [rows] = await this.db.execute(
      "SELECT stock FROM products WHERE id = ?",
      [productId]
    );
    if (!rows.length) throw new AppError("Produk tidak ditemukan", 404);

    const stock = rows[0].stock;
    let newStock;

    if (transactionType === "tambah") {
      newStock = stock + quantity;
    } else if (transactionType === "kurang") {
      newStock = stock - quantity;
      if (newStock < 0) throw new AppError("Stok tidak cukup", 422);
    } else {
      throw new AppError("Jenis transaksi salah", 422);
    }

    await this.db.execute("UPDATE products SET stock = ? WHERE id = ?", [
      newStock,
      productId,
    ]);

    await this.logTransactionLog(
      `UPDATE stock ${productId} quantity:${quantity} => ${newStock} type:${transactionType}`
    );
    return { productId, newStock };
  }

  async createTransaction(
    transactionId,
    productId,
    quantity,
    type,
    customerId
  ) {
    if (!transactionId || !productId)
      throw new AppError("ID transaksi dan produk wajib", 422);
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new AppError("Jumlah harus > 0", 422);

    const [rows] = await this.db.execute(
      "SELECT name, price FROM products WHERE id = ?",
      [productId]
    );
    if (!rows.length) throw new AppError("Produk tidak ditemukan", 404);

    const productPrice = Number(rows[0].price);
    const total = productPrice * quantity;

    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      if (type === "purchase" || type === "pengadaan") {
        await conn.execute(
          "UPDATE products SET stock = stock + ? WHERE id = ?",
          [quantity, productId]
        );

        type = "purchase";
      } else if (type === "sale" || type === "penjualan") {
        const [prod] = await conn.execute(
          "SELECT stock FROM products WHERE id = ? FOR UPDATE",
          [productId]
        );
        const curStock = prod[0].stock;
        if (curStock < quantity) throw new AppError("Stok tidak cukup", 422);
        await conn.execute(
          "UPDATE products SET stock = stock - ? WHERE id = ?",
          [quantity, productId]
        );
        type = "sale";
      } else {
        throw new AppError("Tipe transaksi salah", 422);
      }

      await conn.execute(
        `INSERT INTO transactions (id, product_id, quantity, type, customer_id, product_price, total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          transactionId,
          productId,
          quantity,
          type,
          customerId,
          productPrice,
          total,
        ]
      );

      await conn.commit();
      await this.logTransactionLog(
        `TX ${transactionId} ${type} ${productId} ${quantity} total:${total}`
      );

      return { transactionId, productId, quantity, type, total };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getProductsByCategory(category, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [rows] = await this.db.execute(
      "SELECT id, name, price, category FROM products WHERE category = ? LIMIT ? OFFSET ?",
      [category, limit, offset]
    );
    return rows;
  }

  async getInventoryValue() {
    const [rows] = await this.db.execute(
      "SELECT SUM(price * stock) as totalValue FROM products"
    );
    return { totalValue: Number(rows[0].totalValue || 0) };
  }

  async getProductHistory(productId) {
    const [rows] = await this.db.execute(
      "SELECT id, product_id, quantity, type, customer_id, product_price, total, created_at FROM transactions WHERE product_id = ? ORDER BY created_at DESC",
      [productId]
    );
    return rows;
  }

  async listProducts({ page = 1, limit = 20, category = null, q = null }) {
    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.max(1, parseInt(limit));
    const offset = (validPage - 1) * validLimit;

    let sql = "SELECT id, name, price, stock, category FROM products";
    const params = [];
    const where = [];

    if (category) {
      where.push("category = ?");
      params.push(category);
    }
    if (q) {
      where.push("name LIKE ?");
      params.push(`%${q}%`);
    }
    if (where.length) {
      sql += " WHERE " + where.join(" AND ");
    }

    sql += ` LIMIT ${Number(validLimit)} OFFSET ${Number(offset)}`;

    const [rows] = await this.db.execute(sql, params);
    return rows;
  }

  async getSalesPerMonth(year = new Date().getFullYear()) {
    const [rows] = await this.db.execute(
      `SELECT MONTH(created_at) as month, SUM(total) as total_sales
       FROM transactions
       WHERE type = 'sale' AND YEAR(created_at) = ?
       GROUP BY MONTH(created_at)
       ORDER BY month`,
      [year]
    );
    return rows;
  }

  async getSalesPerCategory({ from = null, to = null } = {}) {
    let sql = `SELECT p.category, SUM(t.total) as total_sales
      FROM transactions t JOIN products p ON t.product_id = p.id
      WHERE t.type = 'sale'`;
    const params = [];
    if (from) {
      sql += " AND t.created_at >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND t.created_at <= ?";
      params.push(to);
    }
    sql += " GROUP BY p.category";
    const [rows] = await this.db.execute(sql, params);
    return rows;
  }

  async getLowStockProducts(threshold = 10) {
    const [rows] = await this.db.execute(
      "SELECT id, name, stock, ? as low_stock_threshold FROM products WHERE stock <= ?",
      [threshold, threshold]
    );
    return rows;
  }

  async getTopProducts(limit = 10) {
    const validLimit = parseInt(limit, 10);

    const [rows] = await this.db.execute(
      `SELECT p.id, p.name, SUM(t.total) as total_sales
       FROM transactions t JOIN products p ON t.product_id = p.id
       WHERE t.type = 'sale'
       GROUP BY p.id, p.name
       ORDER BY total_sales DESC
       LIMIT ${validLimit}`
    );
    return rows;
  }
}
