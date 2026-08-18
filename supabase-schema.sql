-- 1. Tests Table
CREATE TABLE public.tests (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  timer_mode TEXT DEFAULT 'none',
  timer_value INT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  attempt_limit INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Questions Table
CREATE TABLE public.questions (
  id TEXT PRIMARY KEY,
  test_id TEXT REFERENCES public.tests(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  explanation TEXT
);

-- 3. Attempts Table
CREATE TABLE public.attempts (
  id TEXT PRIMARY KEY,
  test_id TEXT REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  total INT NOT NULL,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- Public read policies for active tests & questions
CREATE POLICY "Allow public read tests" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Allow public read questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Allow authenticated create tests" ON public.tests FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Allow authenticated insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow user read own attempts" ON public.attempts FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (SELECT host_id FROM public.tests WHERE id = test_id));
CREATE POLICY "Allow user insert attempts" ON public.attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
