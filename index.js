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

// MySQL Connection
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// CRON: fetch from first backend every hour
cron.schedule('0 * * * *', async () => {
  try {
    const res = await axios.get('https://esp32-water-backend.onrender.com/api/water-level');
    const { level } = res.data;

    if (typeof level === 'number') {
      const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      const currentIST = istDate.toISOString().slice(0, 19).replace('T', ' ');
      await db.execute('INSERT INTO water_levels (level, timestamp) VALUES (?, ?)', [level, currentIST]);
      console.log(`✅ Auto-logged: ${level} at ${currentIST}`);
    }
  } catch (err) {
    console.error('❌ CRON failed:', err.message);
  }
});

// API to get chart data with filter
app.get('/api/chart-data', async (req, res) => {
  const { range } = req.query;

  let interval = '1 DAY';
  if (range === '7d') interval = '7 DAY';
  else if (range === '1m') interval = '1 MONTH';
  else if (range === '3m') interval = '3 MONTH';

  try {
    const [rows] = await db.execute(
      `SELECT level, timestamp FROM water_levels WHERE timestamp >= NOW() - INTERVAL ${interval} ORDER BY timestamp ASC`
    );

    // Format timestamp as "DD/MM/YYYY HH:mm:ss"
    const data = rows.map(row => {
      const date = new Date(row.timestamp);
      const formatted = date.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
      });
      return {
        level: row.level,
        timestamp: formatted
      };
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual log API
app.post('/api/manual-log', async (req, res) => {
  const { level } = req.body;

  if (typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid level value' });
  }

  try {
    const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const currentIST = istDate.toISOString().slice(0, 19).replace('T', ' ');
    await db.execute('INSERT INTO water_levels (level, timestamp) VALUES (?, ?)', [level, currentIST]);
    res.json({ message: `✅ Manually inserted level: ${level} at ${currentIST}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Logger server running on port ${port}`);
});
