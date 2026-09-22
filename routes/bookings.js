const express   = require('express');
const { body, param, query, validationResult } = require('express-validator');
const pool      = require('../db/connection');
const auth      = require('../middleware/auth');
const { sendBookingNotification, sendGuestConfirmation, sendStatusChangeEmail } = require('../services/email');

const router = express.Router();

// ── Helper: generate booking reference ───────────────────────
function generateRef() {
  const d   = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `DWR-${ymd}-${rnd}`;
}

// ─────────────────────────────────────────────────────────────
// POST /api/bookings  — submit new booking (public)
// ─────────────────────────────────────────────────────────────
router.post('/',
  body('tour_id').trim().notEmpty(),
  body('tour_name').trim().notEmpty(),
  body('tour_date').isDate().withMessage('Invalid tour date'),
  body('adults').isInt({ min: 1 }).toInt(),
  body('children').isInt({ min: 0 }).toInt().optional().default(0),
  body('infants').isInt({ min: 0 }).toInt().optional().default(0),
  body('adult_rate').isFloat({ min: 0 }).toFloat(),
  body('child_rate').isFloat({ min: 0 }).toFloat().optional().default(0),
  body('adult_subtotal').isFloat({ min: 0 }).toFloat(),
  body('child_subtotal').isFloat({ min: 0 }).toFloat().optional().default(0),
  body('subtotal').isFloat({ min: 0 }).toFloat(),
  body('total').isFloat({ min: 0 }).toFloat(),
  body('tier_label').optional().trim(),
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('promo_code').optional().trim(),
  body('requests').optional().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const data = req.body;
    const booking_ref = generateRef();

    // ── Auto-confirm rule: ≥ 6 hours before departure → confirmed ─
    // Assume departure at 08:00 WITA (UTC+8)
    const tourDateTime = new Date(`${data.tour_date}T08:00:00+08:00`);
    const hoursUntil   = (tourDateTime - Date.now()) / 3600000;
    const initialStatus = hoursUntil >= 6 ? 'confirmed' : 'pending';

    try {
      const [result] = await pool.query(
        `INSERT INTO bookings
          (booking_ref, tour_id, tour_name, tour_date,
           adults, children, infants,
           adult_rate, child_rate, adult_subtotal, child_subtotal,
           subtotal, total, tier_label,
           full_name, email, phone, promo_code, requests, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          booking_ref,
          data.tour_id, data.tour_name, data.tour_date,
          data.adults, data.children ?? 0, data.infants ?? 0,
          data.adult_rate, data.child_rate ?? 0,
          data.adult_subtotal, data.child_subtotal ?? 0,
          data.subtotal, data.total, data.tier_label ?? null,
          data.full_name, data.email, data.phone,
          data.promo_code ?? null, data.requests ?? null,
          initialStatus,
        ]
      );

      const bookingId = result.insertId;

      // Fetch inserted row for email
      const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      const booking = rows[0];

      // Send emails (non-blocking — don't fail booking if email fails)
      Promise.all([
        sendBookingNotification(booking).catch(e => console.error('Admin email failed:', e.message)),
        (initialStatus === 'confirmed'
          ? sendStatusChangeEmail(booking, 'confirmed').catch(e => console.error('Confirm email failed:', e.message))
          : sendGuestConfirmation(booking).catch(e => console.error('Guest email failed:', e.message))
        ),
      ]);

      return res.status(201).json({
        message:     'Booking submitted successfully.',
        booking_ref,
        booking_id:  bookingId,
      });

    } catch (err) {
      console.error('POST /bookings error:', err);
      return res.status(500).json({ error: 'Failed to save booking. Please try again.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/bookings  — list all bookings (admin only)
// ─────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClauses = [];
  let params = [];

  if (status && status !== 'all') {
    whereClauses.push('b.status = ?');
    params.push(status);
  }
  if (search) {
    whereClauses.push('(b.full_name LIKE ? OR b.email LIKE ? OR b.booking_ref LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSQL = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM bookings b ${whereSQL}`, params
    );

    const [rows] = await pool.query(
      `SELECT b.id, b.booking_ref, b.tour_name, b.tour_date,
              b.adults, b.children, b.infants, b.total,
              b.full_name, b.email, b.phone, b.status, b.created_at
       FROM bookings b ${whereSQL}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Stats
    const [[stats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(status='pending')   AS pending,
        SUM(status='confirmed') AS confirmed,
        SUM(status='completed') AS completed,
        SUM(status='cancelled') AS cancelled
       FROM bookings`
    );

    return res.json({ bookings: rows, total, page: parseInt(page), limit: parseInt(limit), stats });

  } catch (err) {
    console.error('GET /bookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/bookings/:id  — single booking detail (admin only)
// ─────────────────────────────────────────────────────────────
router.get('/:id', auth,
  param('id').isInt(),
  async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Booking not found.' });
    return res.json(rows[0]);
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/status  — update status (admin only)
// ─────────────────────────────────────────────────────────────
router.patch('/:id/status', auth,
  param('id').isInt(),
  body('status').isIn(['pending','confirmed','completed','cancelled']),
  body('status_note').optional().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, status_note } = req.body;
    try {
      const [result] = await pool.query(
        'UPDATE bookings SET status = ?, status_note = ? WHERE id = ?',
        [status, status_note ?? null, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Booking not found.' });

      // Send email for meaningful status changes (non-blocking)
      if (['confirmed','completed','cancelled'].includes(status)) {
        const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        if (rows[0]) {
          sendStatusChangeEmail(rows[0], status, status_note || '')
            .catch(e => console.error('Status email failed:', e.message));
        }
      }

      return res.json({ message: `Status updated to ${status}.`, status });
    } catch (err) {
      console.error('PATCH /bookings/:id/status error:', err);
      return res.status(500).json({ error: 'Failed to update status.' });
    }
  }
);

module.exports = router;
