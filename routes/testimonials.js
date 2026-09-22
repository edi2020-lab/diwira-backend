const express = require('express');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();

// GET /api/testimonials — public; ?all=1 includes inactive
router.get('/', async (req, res) => {
  const where = req.query.all === '1' ? '' : 'WHERE is_active = 1';
  const [rows] = await pool.query(
    `SELECT * FROM testimonials ${where} ORDER BY sort_order ASC, created_at DESC`
  );
  return res.json(rows);
});

// POST /api/testimonials — create (auth)
router.post('/', auth, async (req, res) => {
  const { guest_name, location, rating, content, is_active } = req.body;
  if (!guest_name?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'guest_name and content are required.' });
  }
  const [result] = await pool.query(
    'INSERT INTO testimonials (guest_name, location, rating, content, is_active) VALUES (?,?,?,?,?)',
    [guest_name, location || '', Math.min(5, Math.max(1, parseInt(rating) || 5)), content, is_active == 0 ? 0 : 1]
  );
  const [rows] = await pool.query('SELECT * FROM testimonials WHERE id = ?', [result.insertId]);
  return res.status(201).json(rows[0]);
});

// PUT /api/testimonials/:id — update (auth)
router.put('/:id', auth, async (req, res) => {
  const { guest_name, location, rating, content, is_active } = req.body;
  if (!guest_name?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'guest_name and content are required.' });
  }
  const [result] = await pool.query(
    'UPDATE testimonials SET guest_name=?, location=?, rating=?, content=?, is_active=? WHERE id=?',
    [guest_name, location || '', Math.min(5, Math.max(1, parseInt(rating) || 5)), content, is_active == 0 ? 0 : 1, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found.' });
  const [rows] = await pool.query('SELECT * FROM testimonials WHERE id = ?', [req.params.id]);
  return res.json(rows[0]);
});

// DELETE /api/testimonials/:id — (auth)
router.delete('/:id', auth, async (req, res) => {
  const [result] = await pool.query('DELETE FROM testimonials WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found.' });
  return res.json({ message: 'Testimonial deleted.' });
});

module.exports = router;
