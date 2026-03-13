-- Fix for "Integrate New Application" error
-- This script adds potentially missing columns to the platform_apps table
-- Run this in your Supabase SQL Editor

-- 1. Add invite_required column (from 20260222000001_add_invite_required.sql)
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS invite_required boolean DEFAULT false;

-- 2. Add app_secret column (from 20240204120000_add_app_secret.sql)
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret text;

-- 3. Add slug column (from 20260227000014_add_app_slug.sql)
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS slug text;

-- 4. Ensure RLS policies allow admins to insert (just in case)
-- Note: Edge Functions use service_role key which bypasses RLS, so this is for client-side access safety
-- but good to have.
