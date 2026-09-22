-- ============================================================
-- Diwira Travel — Database Schema
-- Run this in Hostinger hPanel → MySQL Databases → phpMyAdmin
-- ============================================================

CREATE DATABASE IF NOT EXISTS diwira_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE diwira_db;

-- ── Bookings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  booking_ref   VARCHAR(20)  NOT NULL UNIQUE,           -- e.g. DWR-20260921-0001
  tour_id       VARCHAR(50)  NOT NULL,
  tour_name     VARCHAR(200) NOT NULL,
  tour_date     DATE         NOT NULL,
  adults        TINYINT      NOT NULL DEFAULT 1,
  children      TINYINT      NOT NULL DEFAULT 0,
  infants       TINYINT      NOT NULL DEFAULT 0,
  adult_rate    DECIMAL(10,2) NOT NULL,
  child_rate    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  adult_subtotal DECIMAL(10,2) NOT NULL,
  child_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subtotal      DECIMAL(10,2) NOT NULL,
  total         DECIMAL(10,2) NOT NULL,
  tier_label    VARCHAR(100),
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) NOT NULL,
  phone         VARCHAR(50)  NOT NULL,
  promo_code    VARCHAR(50)  DEFAULT NULL,
  requests      TEXT         DEFAULT NULL,
  status        ENUM('pending','confirmed','completed','cancelled')
                NOT NULL DEFAULT 'pending',
  status_note   TEXT         DEFAULT NULL,              -- internal admin note
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status   (status),
  INDEX idx_email    (email),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Admin Users ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(100) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,                     -- bcrypt hash
  full_name  VARCHAR(200),
  role       ENUM('superadmin','admin') NOT NULL DEFAULT 'admin',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  last_login TIMESTAMP    DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed: default superadmin ─────────────────────────────────
-- Password: Diwira@2026 (bcrypt cost 12 — change after first login!)
INSERT IGNORE INTO admins (username, `password`, full_name, role)
VALUES (
  'admin',
  '$2a$12$jmFQw28iMMPSCWLFY6WsvObH1NA86oHCea.B27Hee4c0enF6SoFWm',
  'Super Admin Diwira',
  'superadmin'
);

-- ── Tours ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tours (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(100)  NOT NULL UNIQUE,
  name        VARCHAR(200)  NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  duration    VARCHAR(100),
  category    VARCHAR(100),
  image_url   VARCHAR(500),
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Testimonials ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS testimonials (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  guest_name  VARCHAR(200)  NOT NULL,
  location    VARCHAR(200),
  rating      TINYINT       NOT NULL DEFAULT 5,
  content     TEXT          NOT NULL,
  avatar_url  VARCHAR(500),
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Site Settings (key-value) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  `key`      VARCHAR(100) NOT NULL UNIQUE,
  value      TEXT,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default settings seed
INSERT IGNORE INTO site_settings (`key`, value) VALUES
  ('hero_title',         'Discover the Magic of Bali'),
  ('hero_subtitle',      'Your trusted local tour operator — crafting unforgettable Bali experiences since 2015'),
  ('hero_cta',           'Book Your Tour'),
  ('hero_image',         '/diwira-logo.jpg'),
  ('contact_whatsapp',   '+6282147242621'),
  ('contact_email',      'info.diwira@gmail.com'),
  ('contact_address',    'Jl. Pantai Kelating, Br. Dangin Jalan, Desa Kelating, Kec. Kerambitan, Kab. Tabanan – Bali'),
  ('social_instagram',   ''),
  ('social_facebook',    ''),
  ('social_tripadvisor', ''),
  ('logo_url',           '/diwira-logo.jpg');

