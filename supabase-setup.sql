-- =========================================================================
-- FLOWBOARD SUPABASE DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =========================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Mirrors Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." 
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." 
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile." 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Automatic trigger to create a profile when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. TASKS TABLE (Kanban / Calendar Tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    category VARCHAR(50),
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tasks" 
    ON public.tasks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks" 
    ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" 
    ON public.tasks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" 
    ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- 3. BOARDS TABLE (Visual Spatial Canvases)
CREATE TABLE IF NOT EXISTS public.boards (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'dashboard',
    color VARCHAR(50) DEFAULT '#a04100',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own boards" 
    ON public.boards FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own boards" 
    ON public.boards FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own boards" 
    ON public.boards FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own boards" 
    ON public.boards FOR DELETE USING (auth.uid() = user_id);

-- 4. BOARD ELEMENTS TABLE (Cards, Sticky Notes, Documents, Embeds on Canvas)
CREATE TABLE IF NOT EXISTS public.board_elements (
    id BIGSERIAL PRIMARY KEY,
    board_id BIGINT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    x REAL DEFAULT 100,
    y REAL DEFAULT 100,
    width REAL DEFAULT 260,
    height REAL DEFAULT 180,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_type TEXT,
    color VARCHAR(50) DEFAULT '#ffffff',
    z_index INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.board_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view elements of their own boards" 
    ON public.board_elements FOR SELECT 
    USING (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_elements.board_id AND boards.user_id = auth.uid()));

CREATE POLICY "Users can insert elements to their own boards" 
    ON public.board_elements FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_elements.board_id AND boards.user_id = auth.uid()));

CREATE POLICY "Users can update elements of their own boards" 
    ON public.board_elements FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_elements.board_id AND boards.user_id = auth.uid()));

CREATE POLICY "Users can delete elements of their own boards" 
    ON public.board_elements FOR DELETE 
    USING (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_elements.board_id AND boards.user_id = auth.uid()));

-- 5. BOARD CONNECTIONS TABLE (Arrows and links between cards)
CREATE TABLE IF NOT EXISTS public.board_connections (
    id BIGSERIAL PRIMARY KEY,
    board_id BIGINT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    from_id BIGINT NOT NULL REFERENCES public.board_elements(id) ON DELETE CASCADE,
    to_id BIGINT NOT NULL REFERENCES public.board_elements(id) ON DELETE CASCADE,
    style VARCHAR(50) DEFAULT 'dotted',
    label TEXT,
    color VARCHAR(50) DEFAULT '#8e7164',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.board_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view connections of their own boards" 
    ON public.board_connections FOR SELECT 
    USING (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_connections.board_id AND boards.user_id = auth.uid()));

CREATE POLICY "Users can insert connections to their own boards" 
    ON public.board_connections FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_connections.board_id AND boards.user_id = auth.uid()));

CREATE POLICY "Users can delete connections of their own boards" 
    ON public.board_connections FOR DELETE 
    USING (EXISTS (SELECT 1 FROM public.boards WHERE boards.id = board_connections.board_id AND boards.user_id = auth.uid()));
