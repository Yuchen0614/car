const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const app = express();

// 資料庫連線配置
const pool = new Pool({
  connectionString: 'postgresql://booking_db_vkkx_user:mX4TZ2wO2eEtfnEQ7aOz4cY2riZKaK04@dpg-d1odj9ffte5s73b6kt1g-a.oregon-postgres.render.com/booking_db_vkkx',
  ssl: {
    rejectUnauthorized: false
  }
});

// 自動創建資料表（應用啟動時執行）
(async () => {
  try {
    await pool.query(`
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
    console.log('Database table "bookings" created or already exists');
  } catch (err) {
    console.error('Error creating database table:', err);
  }
})();

// 中間件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 根路徑
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('無法載入頁面');
    }
  });
});

// 取得所有預約（格式化日期和時間）
app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings');
    const bookings = result.rows.map(row => ({
      ...row,
      date: row.date.toISOString().split('T')[0], // 轉為 YYYY-MM-DD
      startTime: row.startTime.toTimeString().split(' ')[0], // 轉為 HH:MM:SS
      endTime: row.endTime.toTimeString().split(' ')[0]
    }));
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: '無法載取預約資料' });
  }
});

// 新增預約
app.post('/api/bookings', async (req, res) => {
  const { department, name, date, startTime, endTime, reason } = req.body;
  if (!department || !name || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ error: '所有欄位都是必填的' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO bookings (department, name, date, startTime, endTime, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [department, name, date, startTime, endTime, reason]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding booking:', err);
    res.status(500).json({ error: '無法新增預約' });
  }
});

// 啟動伺服器
const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
