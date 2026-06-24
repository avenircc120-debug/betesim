-- Migration: Coupon auto-delete support (telegram_message_id)
-- Stores the Telegram message ID for auto-deletion when coupon expires

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id    BIGINT;

-- Function: delete expired coupon Telegram messages via webhook
-- This is triggered by the existing expire_past_coupons() cron

-- Index for finding expired coupons with stored message IDs
CREATE INDEX IF NOT EXISTS coupons_tg_delete_idx ON coupons (match_start_time, telegram_chat_id, telegram_message_id)
  WHERE status = 'expired' AND telegram_message_id IS NOT NULL;
