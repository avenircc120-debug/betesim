-- Migration : suppression tables football / pronostics / coupons / partner_packs
-- À appliquer via le SQL Editor Supabase : https://supabase.com/dashboard/project/mqwrhiffrtbkizyuiytt/sql
DROP VIEW IF EXISTS pronostiqueur_activity CASCADE;
DROP VIEW IF EXISTS pronostiqueur_wallet_balances CASCADE;
DROP TABLE IF EXISTS analyses CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS football_matches CASCADE;
DROP TABLE IF EXISTS pronostic_cache CASCADE;
DROP TABLE IF EXISTS partner_packs CASCADE;
DROP TABLE IF EXISTS booking_codes CASCADE;
DROP TABLE IF EXISTS bookmaker_packages CASCADE;
DROP TABLE IF EXISTS groq_call_log CASCADE;
