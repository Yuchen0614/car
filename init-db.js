const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://booking_db_vkkx_user:mX4TZ2wO2eEtfnEQ7aOz4cY2riZKaK04@dpg-d1odj9ffte5s73b6kt1g-a.oregon-postgres.render.com/booking_db_vkkx',
  ssl: {
    rejectUnauthorized: false
  }
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
