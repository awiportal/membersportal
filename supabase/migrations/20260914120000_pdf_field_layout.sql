-- PDF visual field placement (PandaDoc-style) for the sequential Documents-to-Sign flow.
-- ADDITIVE + idempotent: a sign request may carry a visual FIELD LAYOUT — an
-- ordered array of boxes the admin dropped onto exact spots of the PDF, each
-- assigned to a signer in the ordered chain. The admin authors the boxes (with
-- value = null) when creating the chain; each signer fills in THEIR boxes when
-- they sign; on completion every filled value (typed text/date/name and the
-- signer's signature image) is stamped at its coordinates on the PDF.
--
-- A request whose field_layout is [] (the default) behaves EXACTLY as before, so
-- the existing individual, plain-sequential, broadcast and custom-field flows are
-- all untouched. The same layout (defined per role) is copied onto every member
-- chain of a broadcast, so each chain merges its own signers' values in place.
--
-- Each element of the jsonb array has this shape:
--   {
--     "id":        text,                                     -- stable field id, unique within the layout
--     "page":      int,                                      -- 0-based PDF page index
--     "x":         number,                                   -- NORMALIZED 0..1 of page width,  origin TOP-LEFT
--     "y":         number,                                   -- NORMALIZED 0..1 of page height, origin TOP-LEFT
--     "w":         number,                                   -- NORMALIZED 0..1 of page width
--     "h":         number,                                   -- NORMALIZED 0..1 of page height
--     "type":      "signature" | "name" | "date" | "text",  -- field kind
--     "signer_key":text,                                     -- 'member' (step-1 investor) or an office role lowercased ('secretary'|'treasurer'|'chairlady')
--     "label":     text,                                     -- human label
--     "required":  boolean,                                  -- when true, signing is blocked until the box has a value
--     "value":     text | null                              -- null on the admin-authored definition; the signer's answer once signed
--   }

alter table public.sign_requests
  add column if not exists field_layout jsonb not null default '[]'::jsonb;

comment on column public.sign_requests.field_layout is
  'Ordered array of visually-placed PDF signing fields. Each element: { "id": text, "page": int (0-based), "x": number, "y": number, "w": number, "h": number (all normalized 0..1 of page width/height, origin TOP-LEFT), "type": "signature"|"name"|"date"|"text", "signer_key": text (''member'' or an office role lowercased), "label": text, "required": boolean, "value": text|null }. The admin authors boxes with value=null; each signer sets value on their boxes when signing; filled values are stamped at their coordinates on completion. Empty array (the default) means no placed fields and preserves the original behaviour.';
