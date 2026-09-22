const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, param, validationResult } = require('express-validator');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();

// ── Multer — save images to uploads/tours/ ────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'tours');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `tour-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Helper: generate slug from name
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── GET /api/tours — list (public; ?all=1 returns inactive too) ─
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const where   = showAll ? '' : 'WHERE is_active = 1';
    const [rows]  = await pool.query(
      `SELECT * FROM tours ${where} ORDER BY sort_order ASC, created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('GET /tours error:', err);
    return res.status(500).json({ error: 'Failed to fetch tours.' });
  }
});

// ── GET /api/tours/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
  return res.json(rows[0]);
});

// ── POST /api/tours — create (auth, multipart) ────────────────
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description, price, duration, category, is_active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });

  let slug = slugify(name);
  // Ensure slug uniqueness
  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM tours WHERE slug = ?', [slug]);
  if (count > 0) slug = `${slug}-${Date.now()}`;

  const image_url = req.file ? `/uploads/tours/${req.file.filename}` : null;

  try {
    const [result] = await pool.query(
      `INSERT INTO tours (slug, name, description, price, duration, category, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, name, description || '', parseFloat(price) || 0, duration || '', category || '', image_url, is_active == 0 ? 0 : 1]
    );
    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /tours error:', err);
    return res.status(500).json({ error: 'Failed to create tour.' });
  }
});

// ── PUT /api/tours/:id — update (auth, multipart) ─────────────
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const { name, description, price, duration, category, is_active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });

  try {
    const [existing] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Tour not found.' });

    // Delete old image if new one uploaded
    let image_url = existing[0].image_url;
    if (req.file) {
      if (image_url && image_url.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', image_url);
        fs.unlink(oldPath, () => {});
      }
      image_url = `/uploads/tours/${req.file.filename}`;
    }

    await pool.query(
      `UPDATE tours SET name=?, description=?, price=?, duration=?, category=?, image_url=?, is_active=?
       WHERE id = ?`,
      [name, description || '', parseFloat(price) || 0, duration || '', category || '', image_url, is_active == 0 ? 0 : 1, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error('PUT /tours error:', err);
    return res.status(500).json({ error: 'Failed to update tour.' });
  }
});

// ── DELETE /api/tours/:id ─────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM tours WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
    // Delete image file
    if (rows[0].image_url && rows[0].image_url.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '..', rows[0].image_url), () => {});
    }
    await pool.query('DELETE FROM tours WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Tour deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete tour.' });
  }
});

// ── PATCH /api/tours/:id/toggle — aktif/nonaktif (auth) ───────
router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    await pool.query('UPDATE tours SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
    return res.json({ is_active: rows[0].is_active });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to toggle tour.' });
  }
});

module.exports = router;
