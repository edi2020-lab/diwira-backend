const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/connection');
const auth    = require('../middleware/auth');

const router = express.Router();
const CATEGORIES = ['Half Day Tour','Full Day Tour','Adventure','All Inclusive Tour','Nusa Penida'];

// ── Multer ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'tours');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) =>
    cb(null, `tour-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
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

// ── Helper: get pricing tiers for a tour ─────────────────────
async function getTiers(tourId) {
  const [rows] = await pool.query(
    'SELECT * FROM tour_pricing WHERE tour_id = ? ORDER BY min_pax ASC',
    [tourId]
  );
  return rows;
}

// ── Helper: compute from_price (lowest tier's price_per_person) ─
async function updateFromPrice(tourId) {
  const [rows] = await pool.query(
    'SELECT MIN(price_per_person) as min_p FROM tour_pricing WHERE tour_id = ?',
    [tourId]
  );
  if (rows[0].min_p != null) {
    await pool.query('UPDATE tours SET price = ? WHERE id = ?', [rows[0].min_p, tourId]);
  }
}

// ── GET /api/tours — list (with from_price) ───────────────────
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const category = req.query.category;
    let where = showAll ? '' : 'WHERE t.is_active = 1';
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      where += (where ? ' AND' : 'WHERE') + ' t.category = ?';
      params.push(category);
    }
    const [rows] = await pool.query(
      `SELECT t.*,
         MIN(tp.price_per_person) AS from_price
       FROM tours t
       LEFT JOIN tour_pricing tp ON tp.tour_id = t.id
       ${where}
       GROUP BY t.id
       ORDER BY t.sort_order ASC, t.created_at DESC`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('GET /tours:', err);
    return res.status(500).json({ error: 'Failed to fetch tours.' });
  }
});

// ── GET /api/tours/categories ─────────────────────────────────
router.get('/categories', (req, res) => res.json(CATEGORIES));

// ── GET /api/tours/:id — single tour WITH pricing tiers ───────
router.get('/:id', async (req, res) => {
  try {
    const col = isNaN(req.params.id) ? 'slug' : 'id';
    const [rows] = await pool.query(`SELECT * FROM tours WHERE ${col} = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tour not found.' });
    const tour = rows[0];
    tour.pricing_tiers = await getTiers(tour.id);
    // Compute from_price from tiers (or fall back to price column)
    if (tour.pricing_tiers.length > 0) {
      tour.from_price = Math.min(...tour.pricing_tiers.map(t => parseFloat(t.price_per_person)));
    } else {
      tour.from_price = parseFloat(tour.price) || 0;
    }
    return res.json(tour);
  } catch (err) {
    console.error('GET /tours/:id:', err);
    return res.status(500).json({ error: 'Failed to fetch tour.' });
  }
});

// ── POST /api/tours — create ──────────────────────────────────
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
      [slug, name, description||'', parseFloat(price)||0,
       child_price ? parseFloat(child_price) : null,
       infant_price ? parseFloat(infant_price) : null,
       duration||'', cat, image_url, is_active==0?0:1]
    );

    // Handle pricing tiers if sent as JSON
    let tiers = [];
    try { tiers = JSON.parse(req.body.pricing_tiers || '[]'); } catch {}
    if (tiers.length > 0) {
      await saveTiers(result.insertId, tiers);
      await updateFromPrice(result.insertId);
    }

    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [result.insertId]);
    const tour = rows[0];
    tour.pricing_tiers = await getTiers(tour.id);
    return res.status(201).json(tour);
  } catch (err) {
    console.error('POST /tours:', err);
    return res.status(500).json({ error: 'Failed to create tour.' });
  }
});

// ── PUT /api/tours/:id — update ───────────────────────────────
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

    // Handle pricing tiers
    let tiers = [];
    try { tiers = JSON.parse(req.body.pricing_tiers || '[]'); } catch {}
    if (tiers.length > 0) {
      await saveTiers(req.params.id, tiers);
      await updateFromPrice(req.params.id);
    }

    const [rows] = await pool.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
    const tour = rows[0];
    tour.pricing_tiers = await getTiers(tour.id);
    return res.json(tour);
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
    await pool.query('DELETE FROM tour_pricing WHERE tour_id = ?', [req.params.id]);
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
  return res.json({ is_active: rows[0]?.is_active });
});

// ═══════════════════════════════════════════════════════════════
//  PRICING TIERS — /api/tours/:id/pricing
// ═══════════════════════════════════════════════════════════════

// Helper: replace all tiers for a tour
async function saveTiers(tourId, tiers) {
  await pool.query('DELETE FROM tour_pricing WHERE tour_id = ?', [tourId]);
  if (!tiers || tiers.length === 0) return;
  const values = tiers.map(t => [
    tourId,
    parseInt(t.min_pax) || 1,
    parseInt(t.max_pax) || 1,
    parseFloat(t.price_per_person) || 0,
    t.label || null,
  ]);
  await pool.query(
    'INSERT INTO tour_pricing (tour_id, min_pax, max_pax, price_per_person, label) VALUES ?',
    [values]
  );
}

// GET /api/tours/:id/pricing — get all tiers
router.get('/:id/pricing', async (req, res) => {
  try {
    const tiers = await getTiers(req.params.id);
    return res.json(tiers);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pricing tiers.' });
  }
});

// PUT /api/tours/:id/pricing — replace all tiers (batch save)
router.put('/:id/pricing', auth, async (req, res) => {
  try {
    const tiers = req.body.tiers || [];
    if (!Array.isArray(tiers)) return res.status(400).json({ error: 'tiers must be an array.' });
    await saveTiers(req.params.id, tiers);
    await updateFromPrice(req.params.id);
    return res.json(await getTiers(req.params.id));
  } catch (err) {
    console.error('PUT /pricing:', err);
    return res.status(500).json({ error: 'Failed to save pricing tiers.' });
  }
});

// POST /api/tours/:id/pricing — add single tier
router.post('/:id/pricing', auth, async (req, res) => {
  const { min_pax, max_pax, price_per_person, label } = req.body;
  if (!price_per_person) return res.status(400).json({ error: 'price_per_person required.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO tour_pricing (tour_id, min_pax, max_pax, price_per_person, label) VALUES (?,?,?,?,?)',
      [req.params.id, parseInt(min_pax)||1, parseInt(max_pax)||99, parseFloat(price_per_person), label||null]
    );
    await updateFromPrice(req.params.id);
    const [rows] = await pool.query('SELECT * FROM tour_pricing WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add tier.' });
  }
});

// PUT /api/tours/:id/pricing/:tierId — update single tier
router.put('/:id/pricing/:tierId', auth, async (req, res) => {
  const { min_pax, max_pax, price_per_person, label } = req.body;
  try {
    await pool.query(
      'UPDATE tour_pricing SET min_pax=?, max_pax=?, price_per_person=?, label=? WHERE id=? AND tour_id=?',
      [parseInt(min_pax)||1, parseInt(max_pax)||99, parseFloat(price_per_person), label||null,
       req.params.tierId, req.params.id]
    );
    await updateFromPrice(req.params.id);
    const [rows] = await pool.query('SELECT * FROM tour_pricing WHERE id = ?', [req.params.tierId]);
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update tier.' });
  }
});

// DELETE /api/tours/:id/pricing/:tierId — delete single tier
router.delete('/:id/pricing/:tierId', auth, async (req, res) => {
  await pool.query('DELETE FROM tour_pricing WHERE id = ? AND tour_id = ?', [req.params.tierId, req.params.id]);
  await updateFromPrice(req.params.id);
  return res.json({ message: 'Tier deleted.' });
});

module.exports = router;
