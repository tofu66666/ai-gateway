import os

# The app creates its Supabase client at import time, so give it placeholder settings.
# Tests mock every Supabase call; nothing here reaches a real project.
os.environ.setdefault("SUPABASE_URL", "http://supabase.test")
os.environ.setdefault("SUPABASE_KEY", "test-key")
