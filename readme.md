# Inventory App (Node.js without Express)

## Setup

1. Clone repository / letakkan file pada folder project.
2. Import database dari db.sql

3. Install dependency:
   npm install mysql2

4. Jalankan server:
   node server.js
   -> Server akan berjalan di http://localhost:3000

5. Buka frontend:
   Buka file dashboard/index.html di browser (pastikan server berjalan).

## Endpoint contoh (curl)

- Tambah produk:
  curl -X POST http://localhost:3000/products ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Headphone\",\"price\":50000,\"stock\":215,\"category\":\"audio\"}"

- List produk (pagination):
  curl "http://localhost:3000/products?page=1&limit=10"

- Update product:
  curl.exe -X PUT http://localhost:3000/products/p-1 -H "Content-Type: application/json" -d {
  "name": "Keyboard Mechanical RGB",
  "price": 500000,
  "stock": 20,
  "category": "peripherals"
  }

- Buat transaksi (sale):
  curl.exe -X POST http://localhost:3000/transactions -H "Content-Type: application/json" -d {
  "productId": "p-1",
  "quantity": 5,
  "type": "purchase",
  "customerId": "cust-123"
  }

- Laporan inventory:
  curl.exe -X GET http://localhost:3000/reports/inventory

- Laporan low stock:
  curl.exe -X GET http://localhost:3000/reports/low-stock

## Catatan fitur

- EventEmitter `lowStock` dipancarkan saat stok <= threshold.
- Custom `AppError` dipakai untuk error aplikasi.
- Transaksi dicatat di tabel `transactions` dan juga dicatat ke `transactions.log`.
- Diskon sederhana diterapkan berdasarkan jumlah dan kategori.
