import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import cron from 'node-cron';
import axios from 'axios';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ✅ MySQL Connection Pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ CRON: fetch from ESP32 backend every hour
cron.schedule('0 * * * *', async () => {
  try {
    const res = await axios.get('https://esp32-water-backend.onrender.com/api/water-level');
    const { level } = res.data;

    if (typeof level === 'number') {
      await db.execute('INSERT INTO water_levels (level) VALUES (?)', [level]);
      console.log(`✅ Logged automatically: ${level}`);
    }
  } catch (err) {
    console.error('❌ CRON job error:', err.message);
  }
});

// ✅ Chart Data API with Timezone Adjustment to IST
app.get('/api/chart-data', async (req, res) => {
  const { range } = req.query;

  let interval = '1 DAY'; // default
  if (range === '7d') interval = '7 DAY';
  else if (range === '1m') interval = '1 MONTH';
  else if (range === '3m') interval = '3 MONTH';

  try {
    const [rows] = await db.execute(
      `SELECT level, timestamp FROM water_levels WHERE timestamp >= NOW() - INTERVAL ${interval} ORDER BY timestamp ASC`
    );

    // Convert UTC to IST and format
    const data = rows.map(row => {
      const utcDate = new Date(row.timestamp);
      const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000)); // IST offset
      const formatted = istDate.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
      }).replace(',', '');

      return { level: row.level, timestamp: formatted };
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Manual Log API
app.post('/api/manual-log', async (req, res) => {
  const { level } = req.body;

  if (typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid level value' });
  }

  try {
    await db.execute('INSERT INTO water_levels (level) VALUES (?)', [level]);
    res.json({ message: `✅ Manually inserted level: ${level}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Logger server running on port ${port}`);
});
