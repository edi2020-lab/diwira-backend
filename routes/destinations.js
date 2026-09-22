const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();

// ── Multer setup ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'destinations');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `dest-${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images allowed')),
});

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── GET /api/destinations ─────────────────────────────────────
router.get('/', async (req, res) => {
  const showAll = req.query.all === '1';
  const where   = showAll ? '' : 'WHERE is_active = 1';
  const [rows]  = await pool.query(
    `SELECT * FROM destinations ${where} ORDER BY sort_order ASC, created_at DESC`
  );
  return res.json(rows);
});

// ── GET /api/destinations/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  const col  = isNaN(req.params.id) ? 'slug' : 'id';
  const [rows] = await pool.query(`SELECT * FROM destinations WHERE ${col} = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Destination not found.' });
  return res.json(rows[0]);
});

// ── POST /api/destinations ────────────────────────────────────
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description, location, region, highlights, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  let slug = slugify(name);
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM destinations WHERE slug = ?', [slug]);
  if (cnt > 0) slug = `${slug}-${Date.now()}`;

  const image_url = req.file ? `/uploads/destinations/${req.file.filename}` : null;

  try {
    const [result] = await pool.query(
      `INSERT INTO destinations (name, slug, description, location, region, image_url, highlights, is_active)
       VALUES (?,?,?,?,?,?,?,?)`,
      [name, slug, description||'', location||'', region||'', image_url, highlights||null, is_active==0?0:1]
    );
    const [rows] = await pool.query('SELECT * FROM destinations WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /destinations:', err);
    return res.status(500).json({ error: 'Failed to create destination.' });
  }
});

// ── PUT /api/destinations/:id ─────────────────────────────────
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const { name, description, location, region, highlights, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  try {
    const [existing] = await pool.query('SELECT * FROM destinations WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Destination not found.' });

    let image_url = existing[0].image_url;
    if (req.file) {
      if (image_url?.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', image_url), ()=>{});
      image_url = `/uploads/destinations/${req.file.filename}`;
    }

    await pool.query(
      `UPDATE destinations SET name=?, description=?, location=?, region=?, image_url=?, highlights=?, is_active=?
       WHERE id=?`,
      [name, description||'', location||'', region||'', image_url, highlights||null, is_active==0?0:1, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM destinations WHERE id = ?', [req.params.id]);
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update destination.' });
  }
});

// ── DELETE /api/destinations/:id ──────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM destinations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Destination not found.' });
    if (rows[0].image_url?.startsWith('/uploads/'))
      fs.unlink(path.join(__dirname, '..', rows[0].image_url), ()=>{});
    await pool.query('DELETE FROM destinations WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Destination deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete destination.' });
  }
});

// ── PATCH /api/destinations/:id/toggle ────────────────────────
router.patch('/:id/toggle', auth, async (req, res) => {
  await pool.query('UPDATE destinations SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
  const [rows] = await pool.query('SELECT id, is_active FROM destinations WHERE id = ?', [req.params.id]);
  return res.json({ is_active: rows[0]?.is_active });
});

module.exports = router;
