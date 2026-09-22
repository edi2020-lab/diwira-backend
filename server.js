require('dotenv').config();
const express     = require('express');
const path        = require('path');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const bookingRoutes      = require('./routes/bookings');
const tourRoutes         = require('./routes/tours');
const testimonialRoutes  = require('./routes/testimonials');
const settingsRoutes     = require('./routes/settings');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security ──────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads images
}));

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait.' },
}));
app.use('/api/bookings', (req, res, next) => {
  if (req.method === 'POST') {
    return rateLimit({ windowMs: 60 * 60 * 1000, max: 10,
      message: { error: 'Too many booking attempts.' } })(req, res, next);
  }
  next();
});

// ── Serve uploaded images ─────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/bookings',     bookingRoutes);
app.use('/api/tours',        tourRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/settings',     settingsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Serve React frontend static files ─────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

// ── SPA fallbacks ─────────────────────────────────────────────
app.get('/booking/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'booking', 'index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'admin', 'index.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (err.message?.startsWith('CORS:')) return res.status(403).json({ error: err.message });
  if (err.message?.includes('Only image')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Diwira API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
