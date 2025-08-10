-- db.sql
CREATE DATABASE IF NOT EXISTS morning_glory;
USE morning_glory;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  category VARCHAR(100),
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64),
  quantity INT,
  type ENUM('purchase','sale'),
  customer_id VARCHAR(64),
  product_price DECIMAL(12,2),
  discount DECIMAL(12,2),
  total DECIMAL(12,2),
  created_at DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- sample products
INSERT INTO products (id, name, price, stock, category, created_at) VALUES
('p-1','Keyboard Mechanical', 450000, 25, 'peripherals', NOW()),
('p-2','Mouse Wireless', 150000, 10, 'peripherals',  NOW()),
('p-3','USB Cable', 20000, 100, 'accessories',  NOW()),
('p-4','Power Bank 10000mAh', 200000, 4, 'electronics', NOW());

-- sample customers
INSERT INTO customers (id, name) VALUES ('c-1','Toko A'),('c-2','Toko B');

-- sample transactions
INSERT INTO transactions (id, product_id, quantity, type, customer_id, product_price, discount, total, created_at) VALUES
('t-1','p-1',2,'sale','c-1',450000,0,900000,NOW()),
('t-2','p-3',10,'sale','c-2',20000,0,200000,NOW()),
('t-3','p-4',1,'sale','c-1',200000,0,200000,NOW());
