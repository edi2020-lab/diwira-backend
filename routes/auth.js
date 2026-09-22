const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool     = require('../db/connection');

const router = express.Router();

// POST /api/auth/login
router.post('/login',
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const [rows] = await pool.query(
        'SELECT * FROM admins WHERE username = ? AND is_active = 1',
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const admin = rows[0];
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Update last_login
      await pool.query('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

      // Sign JWT (24h expiry)
      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        token,
        admin: {
          id:        admin.id,
          username:  admin.username,
          full_name: admin.full_name,
          role:      admin.role,
        },
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  }
);

// POST /api/auth/change-password — change own password (requires JWT)
router.post('/change-password', require('../middleware/auth'), async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' });

    const admin = rows[0];
    const match = await bcrypt.compare(current_password, admin.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE admins SET `password` = ? WHERE id = ?', [hash, admin.id]);

    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
