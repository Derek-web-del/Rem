-- External link attachment for lessons (subject_modules).



ALTER TABLE public.subject_modules

  ADD COLUMN IF NOT EXISTS link_url VARCHAR(512);


