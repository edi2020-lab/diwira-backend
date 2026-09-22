const nodemailer = require('nodemailer');

// Create transporter once (reused across requests)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,   // info.diwira@gmail.com
    pass: process.env.EMAIL_PASS,   // Gmail App Password (16-char, NOT account password)
  },
});

/**
 * Send new booking notification to admin.
 * @param {Object} booking - booking record from DB
 */
async function sendBookingNotification(booking) {
  const statusUrl = `${process.env.ADMIN_URL || 'https://diwirawisataindonesia.com/admin'}/`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"/></head>
  <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      
      <!-- Header -->
      <div style="background:#0d9488;padding:24px 28px;">
        <h2 style="margin:0;color:#fff;font-size:20px;">🎉 New Booking — Diwira Travel</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
          Ref: <strong>${booking.booking_ref}</strong> &nbsp;|&nbsp; ${new Date(booking.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA
        </p>
      </div>

      <div style="padding:24px 28px;">

        <!-- Tour Info -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td colspan="2" style="padding:0 0 8px;font-weight:700;color:#0d9488;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">Tour Details</td></tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:40%;">Tour</td>
            <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600;">${booking.tour_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Date</td>
            <td style="padding:8px 12px;font-size:13px;color:#111827;">${booking.tour_date}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Travelers</td>
            <td style="padding:8px 12px;font-size:13px;color:#111827;">
              ${booking.adults} adult(s)${booking.children > 0 ? `, ${booking.children} child(ren)` : ''}${booking.infants > 0 ? `, ${booking.infants} infant(s)` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Pricing Tier</td>
            <td style="padding:8px 12px;font-size:13px;color:#111827;">${booking.tier_label || '-'}</td>
          </tr>
        </table>

        <!-- Pricing -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td colspan="2" style="padding:0 0 8px;font-weight:700;color:#0d9488;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">Price Breakdown</td></tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Adults (${booking.adults} × $${parseFloat(booking.adult_rate).toFixed(2)})</td>
            <td style="padding:8px 12px;font-size:13px;text-align:right;">$${parseFloat(booking.adult_subtotal).toFixed(2)}</td>
          </tr>
          ${booking.children > 0 ? `<tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Children (${booking.children} × $${parseFloat(booking.child_rate).toFixed(2)})</td>
            <td style="padding:8px 12px;font-size:13px;text-align:right;">$${parseFloat(booking.child_subtotal).toFixed(2)}</td>
          </tr>` : ''}
          <tr style="border-top:2px solid #111827;">
            <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#111827;">TOTAL</td>
            <td style="padding:10px 12px;font-size:15px;font-weight:700;text-align:right;color:#0d9488;">$${parseFloat(booking.total).toFixed(2)}</td>
          </tr>
        </table>

        <!-- Guest Info -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td colspan="2" style="padding:0 0 8px;font-weight:700;color:#0d9488;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">Guest Information</td></tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:40%;">Name</td>
            <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600;">${booking.full_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Email</td>
            <td style="padding:8px 12px;font-size:13px;"><a href="mailto:${booking.email}" style="color:#0d9488;">${booking.email}</a></td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Phone / WhatsApp</td>
            <td style="padding:8px 12px;font-size:13px;"><a href="https://wa.me/${booking.phone.replace(/\D/g,'')}" style="color:#0d9488;">${booking.phone}</a></td>
          </tr>
          ${booking.promo_code ? `<tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Promo Code</td>
            <td style="padding:8px 12px;font-size:13px;">${booking.promo_code}</td>
          </tr>` : ''}
          ${booking.requests ? `<tr>
            <td style="padding:8px 12px;font-size:13px;color:#6b7280;vertical-align:top;">Special Requests</td>
            <td style="padding:8px 12px;font-size:13px;">${booking.requests}</td>
          </tr>` : ''}
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin-top:8px;">
          <a href="${statusUrl}" style="display:inline-block;background:#0d9488;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;">
            Open Admin Panel
          </a>
        </div>
      </div>

      <div style="background:#f9fafb;padding:14px 28px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">PT. Diwira Wisata Indonesia &bull; info.diwira@gmail.com &bull; +62 821-4724-2621</p>
      </div>
    </div>
  </body>
  </html>
  `;

  await transporter.sendMail({
    from:    `"Diwira Travel System" <${process.env.EMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL || 'info.diwira@gmail.com',
    subject: `📋 New Booking: ${booking.tour_name} — ${booking.booking_ref}`,
    html,
  });
}

/**
 * Send booking confirmation to the guest.
 * @param {Object} booking
 */
async function sendGuestConfirmation(booking) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"/></head>
  <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:#0d9488;padding:24px 28px;">
        <h2 style="margin:0;color:#fff;font-size:20px;">✅ Booking Received — Thank You!</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Ref: <strong>${booking.booking_ref}</strong></p>
      </div>
      <div style="padding:24px 28px;">
        <p style="font-size:15px;color:#374151;">Hi <strong>${booking.full_name}</strong>,</p>
        <p style="font-size:14px;color:#6b7280;line-height:1.6;">
          We have received your booking for <strong>${booking.tour_name}</strong> on <strong>${booking.tour_date}</strong>.
          Our team will review your booking and send a confirmation via WhatsApp to <strong>${booking.phone}</strong> within 2 hours.
        </p>
        <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 6px;font-weight:700;color:#166534;font-size:13px;">Your Booking Summary</p>
          <p style="margin:4px 0;font-size:13px;color:#374151;">🏝 Tour: ${booking.tour_name}</p>
          <p style="margin:4px 0;font-size:13px;color:#374151;">📅 Date: ${booking.tour_date}</p>
          <p style="margin:4px 0;font-size:13px;color:#374151;">👤 Travelers: ${booking.adults} adult(s)${booking.children > 0 ? `, ${booking.children} child(ren)` : ''}</p>
          <p style="margin:4px 0;font-size:13px;color:#374151;font-weight:700;">💵 Total: $${parseFloat(booking.total).toFixed(2)}</p>
        </div>
        <p style="font-size:13px;color:#6b7280;">
          Questions? Contact us on WhatsApp: <a href="https://wa.me/6282147242621" style="color:#0d9488;">+62 821-4724-2621</a>
        </p>
      </div>
      <div style="background:#f9fafb;padding:14px 28px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">PT. Diwira Wisata Indonesia &bull; Jl. Pantai Kelating, Tabanan — Bali</p>
      </div>
    </div>
  </body>
  </html>
  `;

  await transporter.sendMail({
    from:    `"Diwira Travel" <${process.env.EMAIL_USER}>`,
    to:      booking.email,
    subject: `✅ Booking Confirmed — ${booking.tour_name} (${booking.booking_ref})`,
    html,
  });
}

/**
 * Send status change notification to guest.
 * Called automatically when admin updates booking status.
 */
async function sendStatusChangeEmail(booking, newStatus, note = '') {
  const icons    = { confirmed:'✅', completed:'🎉', cancelled:'❌' };
  const subjects = {
    confirmed: `✅ Your Booking is Confirmed — ${booking.tour_name}`,
    completed: `🎉 Thank You for Traveling with Diwira — ${booking.tour_name}`,
    cancelled: `❌ Booking Cancelled — ${booking.booking_ref}`,
  };
  const messages = {
    confirmed: `<p>Great news! Your booking has been <strong style="color:#0d9488;">confirmed</strong>. Our team will contact you via WhatsApp at <strong>${booking.phone}</strong> with final details.</p>`,
    completed: `<p>Thank you for choosing Diwira Travel! We hope you had a wonderful experience in Bali. We'd love a review!</p>`,
    cancelled: `<p>We're sorry — your booking has been <strong style="color:#dc2626;">cancelled</strong>. Please contact us if you have questions.</p>`,
  };

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
  <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:#0d9488;padding:24px 28px;">
        <h2 style="margin:0;color:#fff;font-size:20px;">${icons[newStatus]||'📋'} Booking Update — Diwira Travel</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Ref: <strong>${booking.booking_ref}</strong></p>
      </div>
      <div style="padding:28px;color:#374151;">
        <p>Dear <strong>${booking.full_name}</strong>,</p>
        ${messages[newStatus]||'<p>Your booking status has been updated.</p>'}
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
          <tr style="background:#f9fafb;"><td style="padding:10px 14px;color:#6b7280;width:40%;">Tour</td><td style="padding:10px 14px;font-weight:600;">${booking.tour_name}</td></tr>
          <tr><td style="padding:10px 14px;color:#6b7280;">Tour Date</td><td style="padding:10px 14px;">${booking.tour_date}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:10px 14px;color:#6b7280;">Total</td><td style="padding:10px 14px;font-weight:700;">$${parseFloat(booking.total).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 14px;color:#6b7280;">New Status</td><td style="padding:10px 14px;font-weight:700;text-transform:uppercase;">${newStatus}</td></tr>
        </table>
        ${note ? `<div style="background:#f0fdf4;border-left:4px solid #0d9488;padding:12px 16px;margin:16px 0;font-size:13px;"><strong>Note:</strong> ${note}</div>` : ''}
        <p style="font-size:13px;">Questions? WhatsApp: <a href="https://wa.me/6282147242621">+6282147242621</a> · Email: <a href="mailto:info.diwira@gmail.com">info.diwira@gmail.com</a></p>
      </div>
      <div style="background:#f9fafb;padding:16px 28px;text-align:center;font-size:11px;color:#9ca3af;">PT. Diwira Wisata Indonesia · Bali, Indonesia</div>
    </div>
  </body></html>`;

  await transporter.sendMail({
    from:    `"Diwira Travel" <${process.env.EMAIL_USER}>`,
    to:      booking.email,
    subject: subjects[newStatus] || `Booking Update — ${booking.booking_ref}`,
    html,
  });
}

module.exports = { sendBookingNotification, sendGuestConfirmation, sendStatusChangeEmail };
