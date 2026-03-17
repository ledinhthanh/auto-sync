import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../tests/.env.test') });

const TABLES = {
  users: 'users',
  orders: 'orders',
  products: 'products',
  order_items: 'order_items',
};

const FIRST_NAMES = ['John', 'Jane', 'Bob', 'Charlie', 'Diana', 'Eva', 'Alice', 'Brian', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mary', 'Nick', 'Olivia', 'Paul', 'Quinn', 'Rose'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations', 'Support', 'Legal'];
const PRODUCT_NAMES = ['Laptop', 'Phone', 'Tablet', 'Monitor', 'Keyboard', 'Mouse', 'Headphones', 'Camera', 'Speaker', 'Watch', 'Printer', 'Scanner', 'Router', 'SSD', 'RAM', 'GPU', 'CPU', 'Motherboard', 'Case', 'Power Supply'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function createTables(conn: mysql.Connection) {
  console.log('Creating tables in MySQL...');

  await conn.query(`DROP TABLE IF EXISTS \`${TABLES.order_items}\``);
  await conn.query(`DROP TABLE IF EXISTS \`${TABLES.orders}\``);
  await conn.query(`DROP TABLE IF EXISTS \`${TABLES.products}\``);
  await conn.query(`DROP TABLE IF EXISTS \`${TABLES.users}\``);

  await conn.query(`
    CREATE TABLE \`${TABLES.users}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      department VARCHAR(255),
      salary DECIMAL(12, 2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE \`${TABLES.products}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      price DECIMAL(10, 2) NOT NULL,
      stock INT DEFAULT 0,
      is_available BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE \`${TABLES.orders}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      total_amount DECIMAL(12, 2),
      status VARCHAR(50) DEFAULT 'pending',
      order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES \`${TABLES.users}\`(id)
    )
  `);

  await conn.query(`
    CREATE TABLE \`${TABLES.order_items}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT,
      product_id INT,
      quantity INT NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(12, 2),
      FOREIGN KEY (order_id) REFERENCES \`${TABLES.orders}\`(id),
      FOREIGN KEY (product_id) REFERENCES \`${TABLES.products}\`(id)
    )
  `);

  console.log('Tables created');
}

async function seedUsers(conn: mysql.Connection, count: number = 300): Promise<number[]> {
  console.log(`Seeding ${count} users...`);
  const ids: number[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const department = randomChoice(DEPARTMENTS);
    const salary = randomInt(40000, 150000);
    const isActive = Math.random() > 0.1;

    const [result] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO \`${TABLES.users}\` (first_name, last_name, email, department, salary, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, email, department, salary, isActive]
    );
    ids.push(result.insertId);
  }

  console.log(`Inserted ${ids.length} users`);
  return ids;
}

async function seedProducts(conn: mysql.Connection, count: number = 50): Promise<number[]> {
  console.log(`Seeding ${count} products...`);
  const ids: number[] = [];
  const categories = ['Electronics', 'Office', 'Accessories', 'Software', 'Hardware'];

  for (let i = 0; i < count; i++) {
    const name = `${randomChoice(PRODUCT_NAMES)} ${String.fromCharCode(65 + randomInt(0, 25))}${randomInt(100, 999)}`;
    const category = randomChoice(categories);
    const price = randomInt(10, 2000) + randomInt(0, 99) / 100;
    const stock = randomInt(0, 500);
    const isAvailable = stock > 0;

    const [result] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO \`${TABLES.products}\` (name, category, price, stock, is_available) VALUES (?, ?, ?, ?, ?)`,
      [name, category, price, stock, isAvailable]
    );
    ids.push(result.insertId);
  }

  console.log(`Inserted ${ids.length} products`);
  return ids;
}

async function seedOrders(conn: mysql.Connection, userIds: number[], productIds: number[], count: number = 500) {
  console.log(`Seeding ${count} orders...`);

  const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2025-12-31');

  const orderIds: number[] = [];
  for (let i = 0; i < count; i++) {
    const userId = randomChoice(userIds);
    const status = randomChoice(statuses);
    const orderDate = randomDate(startDate, endDate);
    const totalAmount = randomInt(20, 2000) + randomInt(0, 99) / 100;

    const [result] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO \`${TABLES.orders}\` (user_id, total_amount, status, order_date) VALUES (?, ?, ?, ?)`,
      [userId, totalAmount, status, orderDate]
    );
    orderIds.push(result.insertId);
  }

  console.log(`Seeding ~${count * 2} order items...`);
  for (let i = 0; i < count * 2; i++) {
    const orderId = randomChoice(orderIds);
    const productId = randomChoice(productIds);
    const quantity = randomInt(1, 10);
    const unitPrice = randomInt(10, 2000) + randomInt(0, 99) / 100;
    const subtotal = Math.round(quantity * unitPrice * 100) / 100;

    await conn.query(
      `INSERT INTO \`${TABLES.order_items}\` (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)`,
      [orderId, productId, quantity, unitPrice, subtotal]
    );
  }

  console.log('Orders and order items seeded');
}

async function verifyData(conn: mysql.Connection) {
  console.log('\n=== Data Verification ===');
  const tables = [TABLES.users, TABLES.products, TABLES.orders, TABLES.order_items];

  for (const table of tables) {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT count(*) as cnt FROM \`${table}\``);
    console.log(`${table}: ${rows[0].cnt} rows`);
  }
}

async function main() {
  const host = process.env.MYSQL_HOST || 'mysql_source';
  const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.MYSQL_USER || 'source_user';
  const password = process.env.MYSQL_PASSWORD || 'source_password';
  const database = process.env.MYSQL_DATABASE || 'mysql_source_db';

  try {
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });

    console.log(`Connected to MySQL database ${database} at ${host}:${port}`);

    await createTables(conn);

    const userIds = await seedUsers(conn, 300);
    const productIds = await seedProducts(conn, 50);
    await seedOrders(conn, userIds, productIds, 500);

    await verifyData(conn);

    console.log('\nMySQL Test data seeding completed!');
    await conn.end();
  } catch (err) {
    console.error('Failed to seed MySQL test data:', err);
    process.exit(1);
  }
}

main();
