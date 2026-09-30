-- 400_blueprint_dispute_waypoint_definitions.sql — Capital Blueprint DIY dispute
-- round steps (client-owned). Seeded onto client checklists only when the buyer
-- paid for consulting-package (src/waypoints/purchase.mjs); repair-only enroll
-- does not include these rows (src/waypoints/seed.mjs).
--
-- COPY RULES match 362: action-only titles and details. No outcome promises.
--
-- verify_kind:
--   dispute_mail_receipt   — closes when a client_upload with subtype
--                            dispute_mail_receipt exists (src/waypoints/verify.mjs)
--   bureau_response_upload — closes when any bureau_response document exists
--
-- SAFETY. Additive. ON CONFLICT DO NOTHING.

INSERT INTO public.waypoint_definitions
  (key, expands, title, detail, position, owner_kind,
   due_offset_days, verify_kind, notes)
VALUES

  ('blueprint_dispute_mail_letters', 'once',
   'Print and mail your dispute letters',
   'Print the letters from your pack, sign where marked, and mail a copy to each bureau address in the instructions. Keep your post office receipt.',
   12, 'client', 14, NULL,
   'Capital Blueprint — client mails round 1. Self-attest or staff close; not machine-checked.'),

  ('blueprint_dispute_mail_receipt', 'once',
   'Upload your mailing proof',
   'Take a clear photo of your post office receipt or the stamped envelopes. Upload it here when you are done.',
   14, 'client', 21, 'dispute_mail_receipt',
   'Proof-to-clear via documents: kind client_upload, subtype dispute_mail_receipt.'),

  ('blueprint_dispute_bureau_response', 'once',
   'Upload bureau responses when they arrive',
   'When a bureau writes back, photograph or scan the letter and upload it here.',
   16, 'client', 45, 'bureau_response_upload',
   'Proof-to-clear via documents: kind bureau_response.')

ON CONFLICT (key) DO NOTHING;
