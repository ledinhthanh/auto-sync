import { Client } from 'pg';
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

async function createTables(client: Client) {
  console.log('Creating tables...');

  await client.query(`DROP TABLE IF EXISTS ${TABLES.order_items} CASCADE`);
  await client.query(`DROP TABLE IF EXISTS ${TABLES.orders} CASCADE`);
  await client.query(`DROP TABLE IF EXISTS ${TABLES.products} CASCADE`);
  await client.query(`DROP TABLE IF EXISTS ${TABLES.users} CASCADE`);

  await client.query(`
    CREATE TABLE ${TABLES.users} (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department TEXT,
      salary NUMERIC(12, 2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE ${TABLES.products} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price NUMERIC(10, 2) NOT NULL,
      stock INTEGER DEFAULT 0,
      is_available BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE ${TABLES.orders} (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${TABLES.users}(id),
      total_amount NUMERIC(12, 2),
      status TEXT DEFAULT 'pending',
      order_date TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE ${TABLES.order_items} (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES ${TABLES.orders}(id),
      product_id INTEGER REFERENCES ${TABLES.products}(id),
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(10, 2) NOT NULL,
      subtotal NUMERIC(12, 2)
    )
  `);

  console.log('Tables created');
}

async function seedUsers(client: Client, count: number = 300): Promise<number[]> {
  console.log(`Seeding ${count} users...`);
  const ids: number[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const department = randomChoice(DEPARTMENTS);
    const salary = randomInt(40000, 150000);
    const isActive = Math.random() > 0.1;

    const result = await client.query(
      `INSERT INTO ${TABLES.users} (first_name, last_name, email, department, salary, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [firstName, lastName, email, department, salary, isActive]
    );
    ids.push(result.rows[0].id);
  }

  console.log(`Inserted ${ids.length} users`);
  return ids;
}

async function seedProducts(client: Client, count: number = 50): Promise<number[]> {
  console.log(`Seeding ${count} products...`);
  const ids: number[] = [];
  const categories = ['Electronics', 'Office', 'Accessories', 'Software', 'Hardware'];

  for (let i = 0; i < count; i++) {
    const name = `${randomChoice(PRODUCT_NAMES)} ${String.fromCharCode(65 + randomInt(0, 25))}${randomInt(100, 999)}`;
    const category = randomChoice(categories);
    const price = randomInt(10, 2000) + randomInt(0, 99) / 100;
    const stock = randomInt(0, 500);
    const isAvailable = stock > 0;

    const result = await client.query(
      `INSERT INTO ${TABLES.products} (name, category, price, stock, is_available) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, category, price, stock, isAvailable]
    );
    ids.push(result.rows[0].id);
  }

  console.log(`Inserted ${ids.length} products`);
  return ids;
}

async function seedOrders(client: Client, userIds: number[], productIds: number[], count: number = 500) {
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

    const result = await client.query(
      `INSERT INTO ${TABLES.orders} (user_id, total_amount, status, order_date) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, totalAmount, status, orderDate]
    );
    orderIds.push(result.rows[0].id);
  }

  console.log(`Seeding ~${count * 2} order items...`);
  for (let i = 0; i < count * 2; i++) {
    const orderId = randomChoice(orderIds);
    const productId = randomChoice(productIds);
    const quantity = randomInt(1, 10);
    const unitPrice = randomInt(10, 2000) + randomInt(0, 99) / 100;
    const subtotal = Math.round(quantity * unitPrice * 100) / 100;

    await client.query(
      `INSERT INTO ${TABLES.order_items} (order_id, product_id, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5)`,
      [orderId, productId, quantity, unitPrice, subtotal]
    );
  }

  console.log('Orders and order items seeded');
}

async function verifyData(client: Client) {
  console.log('\n=== Data Verification ===');
  const tables = [TABLES.users, TABLES.products, TABLES.orders, TABLES.order_items];

  for (const table of tables) {
    const result = await client.query(`SELECT count(*) as cnt FROM ${table}`);
    console.log(`${table}: ${result.rows[0].cnt} rows`);
  }
}

async function main() {
  const client = new Client({
    host: process.env.SOURCE_DB_HOST,
    port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
    user: process.env.SOURCE_DB_USER,
    password: process.env.SOURCE_DB_PASS,
    database: process.env.SOURCE_DB_NAME,
  });

  try {
    await client.connect();
    console.log('Connected to source_db_test');

    await createTables(client);

    const userIds = await seedUsers(client, 300);
    const productIds = await seedProducts(client, 50);
    await seedOrders(client, userIds, productIds, 500);

    await verifyData(client);

    console.log('\nTest data seeding completed!');
  } catch (err) {
    console.error('Failed to seed test data:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
