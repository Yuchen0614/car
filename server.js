require('dotenv').config();
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// 調試：顯示環境變數（避免記錄密碼）
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('PORT:', process.env.PORT);

// 檢查環境變數
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not defined in .env file');
  process.exit(1);
}

// 配置連線池，針對 Neon 最佳化
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, require: true },
  max: 5, // Neon 免費層級最多 20 個連線，設為 5 以保持安全
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // 增加到 20 秒以應對 Neon 冷啟動
  family: 4 // 強制使用 IPv4
});

// 監聽連線池錯誤
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err.stack);
});

// 測試連線並創建表格（新增重試機制）
async function connectWithRetry(attempts = 5, delay = 5000) {
  for (let i = 0; i < attempts; i++) {
    let client;
    try {
      client = await pool.connect();
      console.log('Successfully connected to Neon database');
      const res = await client.query(`
        CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          department VARCHAR(100),
          name VARCHAR(100),
          date DATE,
          startTime TIME,
          endTime TIME,
          reason TEXT
        )
      `);
      console.log('Table "bookings" created or exists:', res.rowCount);
      return;
    } catch (err) {
      console.error(`Connection attempt ${i + 1} failed:`, err.stack);
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      if (client) client.release();
    }
  }
  console.error('Failed to connect to database after retries');
  process.exit(1);
}

connectWithRetry();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/bookings', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT * FROM bookings');
    console.log('Fetched bookings count:', result.rowCount, 'rows:', result.rows);
    if (result.rowCount === 0) {
      console.log('No bookings found in database');
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch error:', err.stack);
    res.status(500).json({ error: '無法載取預約', details: err.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/bookings', async (req, res) => {
  const { department, name, date, startTime, endTime, reason } = req.body;
  if (!department || !name || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ error: '所有欄位必填' });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: '開始時間必須早於結束時間' });
  }
  let client;
  try {
    client = await pool.connect();
    const conflictCheck = await client.query(
      'SELECT * FROM bookings WHERE date = $1 AND (($2 < endTime AND $2 >= startTime) OR ($3 > startTime AND $3 <= endTime))',
      [date, startTime, endTime]
    );
    if (conflictCheck.rowCount > 0) {
      return res.status(409).json({ error: '該時間段已被預約' });
    }
    const result = await client.query(
      'INSERT INTO bookings (department, name, date, startTime, endTime, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [department, name, date, startTime, endTime, reason]
    );
    console.log('Booking added:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Insert error:', err.stack);
    res.status(500).json({ error: '儲存失敗' + (err.code === '22P02' ? '（可能時間格式錯誤）' : '') });
  } finally {
    if (client) client.release();
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password !== process.env.CANCEL_PASSWORD) {
    return res.status(401).json({ error: '無效的取消密碼' });
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [parse
