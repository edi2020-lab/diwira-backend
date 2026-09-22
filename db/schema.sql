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
INSERT IGNORE INTO admins (username, password, full_name, role)
VALUES (
  'admin',
  '$2a$12$jmFQw28iMMPSCWLFY6WsvObH1NA86oHCea.B27Hee4c0enF6SoFWm',
  'Super Admin Diwira',
  'superadmin'
);
