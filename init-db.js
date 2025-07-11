const { Pool } = require('pg');

const pool = new Pool({
  user: 'booking_db_vkkx_user',
  host: 'dpg-d1odj9ffte5s73b6kt1g-a.<region>.onrender.com', // 替換 <region>
  database: 'booking_db_vkkx',
  password: 'mX4TZ2wO2eEtfnEQ7aOz4cY2riZKaK04',
  port: 5432,
});

async function init() {
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
    console.log('Database table created successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await pool.end();
  }
}

init();
