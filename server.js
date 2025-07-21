require('dotenv').config();
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// 調試：顯示環境變數
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

// 檢查環境變數
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not defined in .env file');
  process.exit(1);
}

// 解析連線字串並強制使用 IPv4
const connectionString = process.env.DATABASE_URL;
const parsedUrl = new URL(connectionString);
const pool = new Pool({
  user: parsedUrl.username,
  password: parsedUrl.password,
  host: parsedUrl.hostname,
  port: parsedUrl.port,
  database: parsedUrl.pathname.replace('/', ''),
  ssl: {
    rejectUnauthorized: false, // 允許自簽證書，與 Supabase 相容
    require: true             // 強制使用 SSL
  },
  max: 10,                    // 降低連線數，避免超限
  idleTimeoutMillis: 30000,   // 空閒連線超時 30 秒
  connectionTimeoutMillis: 15000, // 增加連線超時至 15 秒
  family: 4,                  // 強制使用 IPv4
  // 額外診斷：記錄解析後的地址
  parseHost: true
});

// 測試連線並創建表格
(async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('Successfully connected to database with options:', pool.options);
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
  } catch (err) {
    console.error('Table creation error:', err.stack, 'Connection options:', pool.options);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
})();

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
    const result = await client.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [parseInt(id)]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '預約不存在' });
    }
    console.log('Booking deleted, ID:', id, 'row:', result.rows[0]);
    res.json({ message: '預約已取消', deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete error:', err.stack);
    res.status(500).json({ error: '取消失敗', details: err.message });
  } finally {
    if (client) client.release();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
