const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['Half Day Tour','Full Day Tour','Adventure','All Inclusive Tour','Nusa Penida'];

// ── Multer setup ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'tours');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `tour-${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
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

// ── GET /api/tours — list ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const category = req.query.category;
    let sql   = 'WHERE ' + (showAll ? '1=1' : 'is_active = 1');
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      sql += ' AND category = ?';
      params.push(category);
    }
    const [rows] = await pool.query(
      `SELECT * FROM tours ${sql} ORDER BY sort_order ASC, created_at DESC`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('GET /tours:', err);
    return res.status(500).json({ error: 'Failed to fetch tours.' });
  }
});

// ── GET /api/tours/categories — return valid categories ────────
router.get('/categories', (req, res) => res.json(CATEGORIES));

// ── GET /api/tours/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const col = isNaN(req.params.id) ? 'slug' : 'id';
  const [rows] = await pool.query(`SELECT * FROM tours WHERE ${col} = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
  return res.json(rows[0]);
});

// ── POST /api/tours ───────────────────────────────────────────
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description, price, child_price, infant_price, duration, category, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  let slug = slugify(name);
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM tours WHERE slug = ?', [slug]);
  if (cnt > 0) slug = `${slug}-${Date.now()}`;

  const cat = CATEGORIES.includes(category) ? category : 'Full Day Tour';
  const image_url = req.file ? `/uploads/tours/${req.file.filename}` : null;

  try {
    const [result] = await pool.query(
      `INSERT INTO tours (slug, name, description, price, child_price, infant_price, duration, category, image_url, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [slug, name, description || '', parseFloat(price)||0,
       child_price ? parseFloat(child_price) : null,
       infant_price ? parseFloat(infant_price) : null,
       duration||'', cat, image_url, is_active==0?0:1]
    );
    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /tours:', err);
    return res.status(500).json({ error: 'Failed to create tour.' });
  }
});

// ── PUT /api/tours/:id ────────────────────────────────────────
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const { name, description, price, child_price, infant_price, duration, category, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  try {
    const [existing] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Tour not found.' });

    let image_url = existing[0].image_url;
    if (req.file) {
      if (image_url?.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', image_url), ()=>{});
      image_url = `/uploads/tours/${req.file.filename}`;
    }

    const cat = CATEGORIES.includes(category) ? category : existing[0].category;

    await pool.query(
      `UPDATE tours SET name=?, description=?, price=?, child_price=?, infant_price=?,
       duration=?, category=?, image_url=?, is_active=? WHERE id=?`,
      [name, description||'', parseFloat(price)||0,
       child_price ? parseFloat(child_price) : null,
       infant_price ? parseFloat(infant_price) : null,
       duration||'', cat, image_url, is_active==0?0:1, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error('PUT /tours:', err);
    return res.status(500).json({ error: 'Failed to update tour.' });
  }
});

// ── DELETE /api/tours/:id ─────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM tours WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
    if (rows[0].image_url?.startsWith('/uploads/'))
      fs.unlink(path.join(__dirname, '..', rows[0].image_url), ()=>{});
    await pool.query('DELETE FROM tours WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Tour deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete tour.' });
  }
});

// ── PATCH /api/tours/:id/toggle ───────────────────────────────
router.patch('/:id/toggle', auth, async (req, res) => {
  await pool.query('UPDATE tours SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
  const [rows] = await pool.query('SELECT id, is_active FROM tours WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found.' });
  return res.json({ is_active: rows[0].is_active });
});

module.exports = router;
