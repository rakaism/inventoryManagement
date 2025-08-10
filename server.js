import http from "http";
import url from "url";
import InventoryManager from "./inventoryManager.js";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

const DB_CONFIG = {
  host: "localhost",
  user: "root",
  password: "",
  database: "morning_glory",
  waitForConnections: true,
};

const pool = mysql.createPool(DB_CONFIG);

// koneksi database
pool
  .getConnection()
  .then((connection) => {
    console.log("Database connection successful");
    connection.release();
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });

const manager = new InventoryManager(pool);

function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJSON(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    sendJSON(res, 200, {});
    return;
  }

  try {
    //post produk
    if (method === "POST" && path === "/products") {
      const body = await parseJSON(req);
      const id = body.id ?? randomUUID();
      await manager.addProduct(
        id,
        body.name,
        Number(body.price),
        Number(body.stock),
        body.category
      );
      return sendJSON(res, 201, { message: "Product created." });
    }

    //get produk
    if (method === "GET" && path === "/products") {
      const page = Math.max(1, parseInt(parsed.query.page) || 1);
      const limit = Math.max(1, parseInt(parsed.query.limit) || 20);

      if (isNaN(page) || isNaN(limit)) {
        return sendJSON(res, 400, { message: "Invalid page/limit parameter" });
      }

      const category = parsed.query.category || null;
      const q = parsed.query.q || null;

      const products = await manager.listProducts({ page, limit, category, q });
      return sendJSON(res, 200, { page, limit, data: products });
    }

    //update produk
    if (method === "PUT" && path.startsWith("/products/")) {
      const id = path.split("/")[2];
      const body = await parseJSON(req);

      const updates = [];
      const params = [];

      if (body.name) {
        updates.push("name= ?");
        params.push(body.name);
      }
      if (body.price != null) {
        updates.push("price= ?");
        params.push(body.price);
      }
      if (body.stock != null) {
        updates.push("stock= ?");
        params.push(body.stock);
      }
      if (body.category) {
        updates.push("category= ?");
        params.push(body.category);
      }
      if (!updates.length) {
        return sendJSON(res, 400, { message: "Tidak ada update." });
      }

      params.push(id);
      await pool.execute(
        `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
      return sendJSON(res, 200, { id, message: "Berhasil diupadte." });
    }

    //post transaksi
    if (method === "POST" && path === "/transactions") {
      const body = await parseJSON(req);
      const txId = body.id ?? randomUUID();

      const result = await manager.createTransaction(
        txId,
        body.productId,
        Number(body.quantity),
        body.type,
        body.customerId ?? null
      );
      return sendJSON(res, 200, { txId, ...result });
    }

    //get nilai total inventory berdasarkan harga dan stok
    if (method === "GET" && path === "/reports/inventory") {
      const value = await manager.getInventoryValue();
      return sendJSON(res, 200, value);
    }

    // reports buat frontend:
    if (method === "GET" && path === "/reports/sales-per-month") {
      const year = Number(parsed.query.year || new Date().getFullYear());
      const rows = await manager.getSalesPerMonth(year);
      return sendJSON(res, 200, { year, rows });
    }
    if (method === "GET" && path === "/reports/sales-per-category") {
      const from = parsed.query.from || null;
      const to = parsed.query.to || null;
      const rows = await manager.getSalesPerCategory({ from, to });
      return sendJSON(res, 200, { rows });
    }
    if (method === "GET" && path === "/reports/top-products") {
      const limit = Number(parsed.query.limit || 10);
      const rows = await manager.getTopProducts(limit);
      return sendJSON(res, 200, { rows });
    }
    if (method === "GET" && path === "/reports/low-stock") {
      const threshold = Number(parsed.query.threshold || 10);
      const rows = await manager.getLowStockProducts(threshold);
      return sendJSON(res, 200, { items: rows });
    }

    sendJSON(res, 404, { message: "Not Found" });
  } catch (error) {
    console.error(error);
    if (error.name === "AppError") {
      return sendJSON(res, error.code || 400, { message: error.message });
    }
    return sendJSON(res, 500, { message: error.message || "internal error" });
  }
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
