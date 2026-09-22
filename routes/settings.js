const express = require('express');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — returns all settings as { key: value } object (public)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT `key`, value FROM site_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    console.error('GET /settings error:', err);
    return res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

// PUT /api/settings — batch upsert (auth)
// Body: { hero_title: '...', contact_whatsapp: '...', ... }
router.put('/', auth, async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a key-value object.' });
  }

  try {
    const entries = Object.entries(updates);
    if (entries.length === 0) return res.json({ message: 'Nothing to update.' });

    // Upsert each key
    for (const [key, value] of entries) {
      await pool.query(
        'INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, value, value]
      );
    }

    // Return updated settings
    const [rows] = await pool.query('SELECT `key`, value FROM site_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    console.error('PUT /settings error:', err);
    return res.status(500).json({ error: 'Failed to save settings.' });
  }
});

module.exports = router;
