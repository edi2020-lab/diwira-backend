require('dotenv').config();
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const bookingRoutes      = require('./routes/bookings');
const tourRoutes         = require('./routes/tours');
const testimonialRoutes  = require('./routes/testimonials');
const settingsRoutes     = require('./routes/settings');
const destinationRoutes  = require('./routes/destinations');
const mapsRoutes         = require('./routes/maps');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Homepage: inject Maps API key from env at serve time ──────
// The dist/index.html contains __GOOGLE_MAPS_KEY__ placeholder.
// We replace it with process.env.GOOGLE_MAPS_API_KEY so the
// actual key is NEVER stored in the git repository.
const HOMEPAGE_PATH = path.join(__dirname, 'dist', 'index.html');
let _homepageCache  = null;  // cache after first read

function serveHomepage(req, res) {
  try {
    if (!_homepageCache) {
      const raw = fs.readFileSync(HOMEPAGE_PATH, 'utf8');
      const key = process.env.GOOGLE_MAPS_API_KEY || '';
      _homepageCache = raw.replace(/__GOOGLE_MAPS_KEY__/g, key);
      if (!key) console.warn('⚠️  GOOGLE_MAPS_API_KEY not set — Maps autocomplete disabled');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(_homepageCache);
  } catch (e) {
    console.error('serveHomepage error:', e.message);
    res.status(500).send('Page unavailable.');
  }
}

// ── Security ──────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads images
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                    "maps.googleapis.com", "*.googleapis.com"],
      styleSrc:    ["'self'", "'unsafe-inline'",
                    "fonts.googleapis.com", "*.googleapis.com"],
      imgSrc:      ["'self'", "data:", "blob:",
                    "*.googleapis.com", "*.gstatic.com", "maps.gstatic.com"],
      connectSrc:  ["'self'", "*.googleapis.com", "maps.googleapis.com"],
      fontSrc:     ["'self'", "fonts.gstatic.com", "fonts.googleapis.com"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
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

// ── Homepage route (key injected) — BEFORE express.static ─────
app.get('/', serveHomepage);

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/bookings',     bookingRoutes);
app.use('/api/tours',        tourRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/settings',     settingsRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/maps',         mapsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Static files (index:false prevents auto-serving index.html) ─
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

// ── SPA fallbacks ─────────────────────────────────────────────
app.get('/booking/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'booking', 'index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'admin', 'index.html'));
});

// Homepage catch-all (deep-links like /#section, /about, etc.)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  serveHomepage(req, res);
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
  console.log(`   Maps API key: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ set' : '❌ NOT SET'}`);
});

module.exports = app;
