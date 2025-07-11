require('dotenv').config();
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const app = express();

// 調試：顯示環境變數
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

// 使用連線字串中的 sslmode，同時提供備用 SSL 配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 允許自簽憑證
  }
});

// 測試連線並創建表格
(async () => {
  try {
    const client = await pool.connect();
    console.log('Database connection successful');
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
    client.release();
  } catch (err) {
    console.error('Table creation error:', err.stack);
  }
})();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings');
    console.log('Fetched bookings:', result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch error:', err.stack);
    res.status(500).json({ error: '無法載取預約' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { department, name, date, startTime, endTime, reason } = req.body;
  if (!department || !name || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ error: '所有欄位必填' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO bookings (department, name, date, startTime, endTime, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [department, name, date, startTime, endTime, reason]
    );
    console.log('Booking added:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Insert error:', err.stack);
    res.status(500).json({ error: '儲存失敗' + (err.code === '22P02' ? '（可能時間格式錯誤）' : '') });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
