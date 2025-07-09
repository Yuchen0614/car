const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

// 確保 bookings.json 存在
async function initializeBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch (error) {
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify([]));
  }
}

// 取得所有預約
app.get('/api/bookings', async (req, res) => {
  try {
    await initializeBookingsFile();
    const data = await fs.readFile(BOOKINGS_FILE);
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading bookings:', error);
    res.status(500).json({ error: '無法讀取預約資料' });
  }
});

// 新增預約（檢查時間重疊）
app.post('/api/bookings', async (req, res) => {
  try {
    const { department, name, date, startTime, endTime, reason } = req.body;
    if (!department || !name || !date || !startTime || !endTime || !reason) {
      return res.status(400).json({ error: '所有欄位都是必填的' });
    }

    await initializeBookingsFile();
    const data = await fs.readFile(BOOKINGS_FILE);
    let bookings = JSON.parse(data);

    // 檢查時間重疊
    const newStart = startTime;
    const newEnd = endTime;
    const hasOverlap = bookings.some(booking => {
      if (booking.date !== date) return false;
      const existingStart = booking.startTime;
      const existingEnd = booking.endTime;
      // 重疊條件：新預約的開始時間或結束時間落在現有預約的範圍內，或新預約包含現有預約
      return (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      );
    });

    if (hasOverlap) {
      return res.status(400).json({ error: '時間範圍與現有預約重疊，請選擇其他時間' });
    }

    const newBooking = {
      id: String(bookings.length + 1),
      department,
      name,
      date,
      startTime,
      endTime,
      reason
    };

    bookings.push(newBooking);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    res.json(newBooking);
  } catch (error) {
    console.error('Error adding booking:', error);
    res.status(500).json({ error: '無法新增預約' });
  }
});

// 刪除預約
app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const bookingId = req.params.id;
    await initializeBookingsFile();
    const data = await fs.readFile(BOOKINGS_FILE);
    let bookings = JSON.parse(data);

    const index = bookings.findIndex(booking => booking.id === bookingId);
    if (index === -1) {
      return res.status(404).json({ error: '找不到該預約' });
    }

    bookings.splice(index, 1);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    res.json({ message: '預約已刪除' });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: '無法刪除預約' });
  }
});

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});