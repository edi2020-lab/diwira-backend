const express = require('express');
const router  = express.Router();

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ── Transfer pricing table ────────────────────────────────────
// Base price by distance slab (USD)
function calcTransferPrice(km, pax = 1, bags = 0) {
  let base;
  if      (km <= 10)  base = 15;
  else if (km <= 20)  base = 20;
  else if (km <= 30)  base = 25;
  else if (km <= 40)  base = 30;
  else if (km <= 55)  base = 35;
  else if (km <= 75)  base = 45;
  else                base = 55;

  const paxSurcharge = pax >= 5 ? 10 : 0;  // extra for 5+ pax (need larger vehicle)
  const bagSurcharge = bags >= 5 ? 5  : 0;  // extra for heavy luggage

  return { base, paxSurcharge, bagSurcharge, total: base + paxSurcharge + bagSurcharge };
}

// ── GET /api/maps/distance ────────────────────────────────────
// Query: origin, destination, pax (optional), bags (optional)
router.get('/distance', async (req, res) => {
  const { origin, destination, pax = 1, bags = 0 } = req.query;

  if (!origin?.trim() || !destination?.trim()) {
    return res.status(400).json({ error: 'origin and destination are required.' });
  }
  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Google Maps API key not configured.' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins',      origin);
    url.searchParams.set('destinations', destination);
    url.searchParams.set('units',        'metric');
    url.searchParams.set('mode',         'driving');
    url.searchParams.set('region',       'id');   // Indonesia region bias
    url.searchParams.set('key',          MAPS_KEY);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Maps API HTTP ${resp.status}`);

    const data = await resp.json();

    if (data.status !== 'OK') {
      return res.status(400).json({ error: `Maps API error: ${data.status}`, details: data.error_message });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return res.status(404).json({ error: 'Route not found. Please check the addresses.' });
    }

    const dist_m   = element.distance.value;        // metres
    const dist_km  = Math.round(dist_m / 100) / 10; // km, 1 decimal
    const dur_min  = Math.round(element.duration.value / 60);
    const price    = calcTransferPrice(dist_km, parseInt(pax), parseInt(bags));

    return res.json({
      origin_address:      data.origin_addresses?.[0]  || origin,
      destination_address: data.destination_addresses?.[0] || destination,
      distance_km:  dist_km,
      distance_text: element.distance.text,
      duration_min: dur_min,
      duration_text: element.duration.text,
      price,
    });

  } catch (err) {
    console.error('GET /api/maps/distance:', err.message);
    return res.status(500).json({ error: 'Failed to calculate distance. Please try again.' });
  }
});

// ── GET /api/maps/autocomplete ────────────────────────────────
// Proxy Places Autocomplete so we never expose the key to the browser
router.get('/autocomplete', async (req, res) => {
  const { input, sessiontoken } = req.query;
  if (!input?.trim()) return res.json({ predictions: [] });
  if (!MAPS_KEY) return res.status(500).json({ error: 'Maps not configured.' });

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input',       input);
    url.searchParams.set('components',  'country:id');   // Bias to Indonesia
    url.searchParams.set('location',    '-8.650979,115.216667'); // Bali centre
    url.searchParams.set('radius',      '200000');              // 200km radius
    url.searchParams.set('language',    'en');
    url.searchParams.set('key',         MAPS_KEY);
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    const predictions = (data.predictions || []).map(p => ({
      place_id:    p.place_id,
      description: p.description,
      main_text:   p.structured_formatting?.main_text   || p.description,
      secondary:   p.structured_formatting?.secondary_text || '',
    }));

    return res.json({ predictions, status: data.status });
  } catch (err) {
    console.error('Autocomplete error:', err.message);
    return res.json({ predictions: [] });
  }
});

module.exports = router;
