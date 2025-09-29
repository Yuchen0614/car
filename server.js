require('dotenv').config();
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// 調試：檢查環境變數（避免記錄敏感資訊）
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
  connectionTimeoutMillis: 20000, // 應對 Neon 冷啟動
  family: 4 // 強制使用 IPv4
});

// 監聽連線池錯誤
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err.stack);
});

// 測試連線並創建表格（包含重試機制）
async function connectWithRetry(attempts = 5, delay = 5000) {
  for (let i = 0; i < attempts; i++) {
    let client;
    try {
      client = await pool.connect();
      console.log('Successfully connected to Neon database');
      const res = await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          pushups INTEGER DEFAULT 100,
          squats INTEGER DEFAULT 100
        )
      `);
      console.log('Table "players" created or exists:', res.rowCount);
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

app.get('/api/players', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT * FROM players ORDER BY name');
    console.log('Fetched players count:', result.rowCount, 'rows:', result.rows);
    if (result.rowCount === 0) {
      console.log('No players found in database');
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch error:', err.stack);
    res.status(500).json({ error: '無法載取玩家資料', details: err.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/players', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '姓名必填' });
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'INSERT INTO players (name) VALUES ($1) RETURNING * ON CONFLICT (name) DO NOTHING',
      [name]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: '玩家姓名已存在' });
    }
    console.log('Player added:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Insert error:', err.stack);
    res.status(500).json({ error: '新增失敗' });
  } finally {
    if (client) client.release();
  }
});

app.put('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  const { pushups, squats } = req.body;
  if (pushups === undefined && squats === undefined) {
    return res.status(400).json({ error: '至少更新一項剩餘次數' });
  }
  let client;
  try {
    client = await pool.connect();
    const updates = [];
    const values = [];
    let index = 1;
    if (pushups !== undefined) {
      updates.push(`pushups = $${index++}`);
      values.push(pushups);
    }
    if (squats !== undefined) {
      updates.push(`squats = $${index++}`);
      values.push(squats);
    }
    values.push(parseInt(id));
    const result = await client.query(
      `UPDATE players SET ${updates.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '玩家不存在' });
    }
    console.log('Player updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update error:', err.stack);
    res.status(500).json({ error: '更新失敗', details: err.message });
  } finally {
    if (client) client.release();
  }
});

app.delete('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password !== process.env.CANCEL_PASSWORD) {
    return res.status(401).json({ error: '無效的刪除密碼' });
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('DELETE FROM players WHERE id = $1 RETURNING *', [parseInt(id)]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '玩家不存在' });
    }
    console.log('Player deleted, ID:', id, 'row:', result.rows[0]);
    res.json({ message: '玩家已刪除', deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete error:', err.stack);
    res.status(500).json({ error: '刪除失敗', details: err.message });
  } finally {
    if (client) client.release();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
