import { z } from 'zod';

// Chrome blocks code built from strings in extension pages and reports zod's probe for it as a
// policy violation, so the probe is off. Import this module before any module builds a schema.
z.config({ jitless: true });
