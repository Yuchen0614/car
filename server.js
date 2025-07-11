const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const app = express();

// 資料庫配置 (使用環境變數或硬編碼，推薦後續使用環境變數)
const pool = new Pool({
  user: 'booking_db_vkkx_user',
  host: 'dpg-d1odj9ffte5s73b6kt1g-a.<region>.onrender.com', // 替換 <region> (例如 us-east)
  database: 'booking_db_vkkx',
  password: 'mX4TZ2wO2eEtfnEQ7aOz4cY2riZKaK04',
  port: 5432,
});

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

// 取得所有預約
app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings');
    res.json(result.rows);
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

// 刪除預約
app.delete('/api/bookings/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到該預約' });
    }
    res.json({ message: '預約已刪除' });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: '無法刪除預約' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
