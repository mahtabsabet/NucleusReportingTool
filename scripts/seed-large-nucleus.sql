-- =============================================================
-- Large-scale demo nucleus seed
-- Paste this into the Supabase SQL editor and click "Run".
-- Safe to run multiple times (uses INSERT ... ON CONFLICT DO NOTHING
-- or DO UPDATE so existing rows are not duplicated).
-- =============================================================

BEGIN;

-- ── 1. Demo cluster ────────────────────────────────────────────
INSERT INTO clusters (id, name, center_lat, center_lng, zoom)
VALUES ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c001',
        'Demo Cluster', 43.6532, -79.3832, 11)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name;

-- ── 2. Demo nucleus ───────────────────────────────────────────
INSERT INTO nuclei (id, cluster_id, name, lat, lng)
VALUES ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101',
        'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c001',
        'Riverdale Neighbourhood Nucleus', 43.6678, -79.3677)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name;

-- ── 3. People (80 diverse names) ──────────────────────────────
INSERT INTO persons (id, name, is_minor) VALUES
  ('b0000001-b000-b000-b000-b00000000001', 'Arash Tehrani',          false),
  ('b0000002-b000-b000-b000-b00000000002', 'Sofia Morales',          false),
  ('b0000003-b000-b000-b000-b00000000003', 'Hiroshi Nakamura',       false),
  ('b0000004-b000-b000-b000-b00000000004', 'Amara Diallo',           false),
  ('b0000005-b000-b000-b000-b00000000005', 'David Osei',             false),
  ('b0000006-b000-b000-b000-b00000000006', 'Nadia Kowalski',         false),
  ('b0000007-b000-b000-b000-b00000000007', 'Tariq Al-Rashid',        false),
  ('b0000008-b000-b000-b000-b00000000008', 'Priya Sharma',           false),
  ('b0000009-b000-b000-b000-b00000000009', 'Marcus Baptiste',        false),
  ('b0000010-b000-b000-b000-b00000000010', 'Leila Hosseini',         false),
  ('b0000011-b000-b000-b000-b00000000011', 'Samuel Okonkwo',         false),
  ('b0000012-b000-b000-b000-b00000000012', 'Carmen Vega',            false),
  ('b0000013-b000-b000-b000-b00000000013', 'Jun Wei',                false),
  ('b0000014-b000-b000-b000-b00000000014', 'Fatima Al-Zahrawi',      false),
  ('b0000015-b000-b000-b000-b00000000015', 'James Mbeki',            false),
  ('b0000016-b000-b000-b000-b00000000016', 'Ingrid Lindqvist',       false),
  ('b0000017-b000-b000-b000-b00000000017', 'Reza Ahmadi',            false),
  ('b0000018-b000-b000-b000-b00000000018', 'Oluwaseun Adeyemi',      false),
  ('b0000019-b000-b000-b000-b00000000019', 'Ana Cristina Ferreira',  false),
  ('b0000020-b000-b000-b000-b00000000020', 'Kiran Patel',            false),
  ('b0000021-b000-b000-b000-b00000000021', 'Yusuf Hassan',           false),
  ('b0000022-b000-b000-b000-b00000000022', 'Mei-Ling Zhou',          false),
  ('b0000023-b000-b000-b000-b00000000023', 'Ibrahim Touré',          false),
  ('b0000024-b000-b000-b000-b00000000024', 'Natalia Petrenko',       false),
  ('b0000025-b000-b000-b000-b00000000025', 'Emmanuel Nkosi',         false),
  ('b0000026-b000-b000-b000-b00000000026', 'Yasmin El-Sayed',        false),
  ('b0000027-b000-b000-b000-b00000000027', 'Thomas Ochieng',         false),
  ('b0000028-b000-b000-b000-b00000000028', 'Sunita Rao',             false),
  ('b0000029-b000-b000-b000-b00000000029', 'Kwame Asante',           false),
  ('b0000030-b000-b000-b000-b00000000030', 'Layla Mansouri',         false),
  ('b0000031-b000-b000-b000-b00000000031', 'Patrick Nguyen',         false),
  ('b0000032-b000-b000-b000-b00000000032', 'Amina Waweru',           false),
  ('b0000033-b000-b000-b000-b00000000033', 'Dmitri Volkov',          false),
  ('b0000034-b000-b000-b000-b00000000034', 'Rosa Hernández',         false),
  ('b0000035-b000-b000-b000-b00000000035', 'Abubakar Jallow',        false),
  ('b0000036-b000-b000-b000-b00000000036', 'Yuki Tanaka',            false),
  ('b0000037-b000-b000-b000-b00000000037', 'Miriam Cohen',           false),
  ('b0000038-b000-b000-b000-b00000000038', 'Chibueze Eze',           false),
  ('b0000039-b000-b000-b000-b00000000039', 'Alejandra Ruiz',         false),
  ('b0000040-b000-b000-b000-b00000000040', 'Hamid Karimi',           false),
  ('b0000041-b000-b000-b000-b00000000041', 'Grace Muthoni',          false),
  ('b0000042-b000-b000-b000-b00000000042', 'Sebastián Castro',       false),
  ('b0000043-b000-b000-b000-b00000000043', 'Zara Ahmed',             false),
  ('b0000044-b000-b000-b000-b00000000044', 'Kofi Mensah',            false),
  ('b0000045-b000-b000-b000-b00000000045', 'Nina Eriksson',          false),
  ('b0000046-b000-b000-b000-b00000000046', 'Bilal Chaudhry',         false),
  ('b0000047-b000-b000-b000-b00000000047', 'Adaeze Obi',             false),
  ('b0000048-b000-b000-b000-b00000000048', 'Liu Yang',               false),
  ('b0000049-b000-b000-b000-b00000000049', 'Mariam Traoré',          false),
  ('b0000050-b000-b000-b000-b00000000050', 'Elan Brightwater',       false),
  ('b0000051-b000-b000-b000-b00000000051', 'Nour Al-Hamdan',         false),
  ('b0000052-b000-b000-b000-b00000000052', 'Joseph Kamau',           false),
  ('b0000053-b000-b000-b000-b00000000053', 'Valentina Rossi',        false),
  ('b0000054-b000-b000-b000-b00000000054', 'Ahmed Saleh',            false),
  ('b0000055-b000-b000-b000-b00000000055', 'Blessing Adekunle',      false),
  ('b0000056-b000-b000-b000-b00000000056', 'Hana Suzuki',            false),
  ('b0000057-b000-b000-b000-b00000000057', 'Viktor Petrov',          false),
  ('b0000058-b000-b000-b000-b00000000058', 'Chiamaka Eze',           false),
  ('b0000059-b000-b000-b000-b00000000059', 'Rodrigo Lima',           false),
  ('b0000060-b000-b000-b000-b00000000060', 'Sadaf Nazari',           false),
  ('b0000061-b000-b000-b000-b00000000061', 'Tendai Moyo',            false),
  ('b0000062-b000-b000-b000-b00000000062', 'Cecilia Park',           false),
  ('b0000063-b000-b000-b000-b00000000063', 'Omar Farouq',            false),
  ('b0000064-b000-b000-b000-b00000000064', 'Saoirse Murphy',         false),
  ('b0000065-b000-b000-b000-b00000000065', 'Jomo Mwangi',            false),
  ('b0000066-b000-b000-b000-b00000000066', 'Deepa Krishnan',         false),
  ('b0000067-b000-b000-b000-b00000000067', 'Lorenzo Ferrari',        false),
  ('b0000068-b000-b000-b000-b00000000068', 'Amara Bah',              false),
  ('b0000069-b000-b000-b000-b00000000069', 'Xiomara Castillo',       false),
  ('b0000070-b000-b000-b000-b00000000070', 'Faisal Qureshi',         false),
  ('b0000071-b000-b000-b000-b00000000071', 'Nneka Okafor',           false),
  ('b0000072-b000-b000-b000-b00000000072', 'Andrei Ionescu',         false),
  ('b0000073-b000-b000-b000-b00000000073', 'Hira Baig',              false),
  ('b0000074-b000-b000-b000-b00000000074', 'Calvin Owusu',           false),
  ('b0000075-b000-b000-b000-b00000000075', 'Lena Müller',            false),
  ('b0000076-b000-b000-b000-b00000000076', 'Mustafa Yilmaz',         false),
  ('b0000077-b000-b000-b000-b00000000077', 'Abena Agyeman',          false),
  ('b0000078-b000-b000-b000-b00000000078', 'Wei Chen',               false),
  ('b0000079-b000-b000-b000-b00000000079', 'Ifeoma Nwosu',           false),
  ('b0000080-b000-b000-b000-b00000000080', 'Paulo Souza',            false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ── 4. Enroll everyone into the demo nucleus with tier assignments ─
--   Core (coordinating):       7 people  — tight inner band
--   Supporting:               13 people  — mid band
--   Participating:            32 people  — wide outer band
--   Aware:                    28 people  — widest band

INSERT INTO nucleus_enrollments (person_id, nucleus_id, engagement_level)
VALUES
  -- CORE (7) ─────────────────────────────────────────────────────
  ('b0000001-b000-b000-b000-b00000000001', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000002-b000-b000-b000-b00000000002', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000003-b000-b000-b000-b00000000003', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000004-b000-b000-b000-b00000000004', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000005-b000-b000-b000-b00000000005', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000006-b000-b000-b000-b00000000006', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),
  ('b0000007-b000-b000-b000-b00000000007', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'coordinating'),

  -- SUPPORTING (13) ──────────────────────────────────────────────
  ('b0000008-b000-b000-b000-b00000000008', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000009-b000-b000-b000-b00000000009', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000010-b000-b000-b000-b00000000010', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000011-b000-b000-b000-b00000000011', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000012-b000-b000-b000-b00000000012', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000013-b000-b000-b000-b00000000013', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000014-b000-b000-b000-b00000000014', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000015-b000-b000-b000-b00000000015', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000016-b000-b000-b000-b00000000016', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000017-b000-b000-b000-b00000000017', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000018-b000-b000-b000-b00000000018', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000019-b000-b000-b000-b00000000019', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),
  ('b0000020-b000-b000-b000-b00000000020', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'supporting'),

  -- PARTICIPATING (32) ───────────────────────────────────────────
  ('b0000021-b000-b000-b000-b00000000021', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000022-b000-b000-b000-b00000000022', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000023-b000-b000-b000-b00000000023', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000024-b000-b000-b000-b00000000024', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000025-b000-b000-b000-b00000000025', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000026-b000-b000-b000-b00000000026', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000027-b000-b000-b000-b00000000027', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000028-b000-b000-b000-b00000000028', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000029-b000-b000-b000-b00000000029', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000030-b000-b000-b000-b00000000030', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000031-b000-b000-b000-b00000000031', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000032-b000-b000-b000-b00000000032', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000033-b000-b000-b000-b00000000033', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000034-b000-b000-b000-b00000000034', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000035-b000-b000-b000-b00000000035', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000036-b000-b000-b000-b00000000036', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000037-b000-b000-b000-b00000000037', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000038-b000-b000-b000-b00000000038', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000039-b000-b000-b000-b00000000039', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000040-b000-b000-b000-b00000000040', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000041-b000-b000-b000-b00000000041', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000042-b000-b000-b000-b00000000042', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000043-b000-b000-b000-b00000000043', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000044-b000-b000-b000-b00000000044', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000045-b000-b000-b000-b00000000045', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000046-b000-b000-b000-b00000000046', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000047-b000-b000-b000-b00000000047', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000048-b000-b000-b000-b00000000048', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000049-b000-b000-b000-b00000000049', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000050-b000-b000-b000-b00000000050', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000051-b000-b000-b000-b00000000051', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),
  ('b0000052-b000-b000-b000-b00000000052', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'participating'),

  -- AWARE (28) ───────────────────────────────────────────────────
  ('b0000053-b000-b000-b000-b00000000053', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000054-b000-b000-b000-b00000000054', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000055-b000-b000-b000-b00000000055', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000056-b000-b000-b000-b00000000056', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000057-b000-b000-b000-b00000000057', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000058-b000-b000-b000-b00000000058', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000059-b000-b000-b000-b00000000059', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000060-b000-b000-b000-b00000000060', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000061-b000-b000-b000-b00000000061', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000062-b000-b000-b000-b00000000062', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000063-b000-b000-b000-b00000000063', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000064-b000-b000-b000-b00000000064', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000065-b000-b000-b000-b00000000065', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000066-b000-b000-b000-b00000000066', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000067-b000-b000-b000-b00000000067', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000068-b000-b000-b000-b00000000068', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000069-b000-b000-b000-b00000000069', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000070-b000-b000-b000-b00000000070', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000071-b000-b000-b000-b00000000071', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000072-b000-b000-b000-b00000000072', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000073-b000-b000-b000-b00000000073', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000074-b000-b000-b000-b00000000074', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000075-b000-b000-b000-b00000000075', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000076-b000-b000-b000-b00000000076', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000077-b000-b000-b000-b00000000077', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000078-b000-b000-b000-b00000000078', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000079-b000-b000-b000-b00000000079', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware'),
  ('b0000080-b000-b000-b000-b00000000080', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101', 'aware')
ON CONFLICT (person_id, nucleus_id) DO UPDATE
  SET engagement_level = EXCLUDED.engagement_level;

COMMIT;

-- Result: Riverdale Neighbourhood Nucleus
--   CORE          7
--   SUPPORTING   13
--   PARTICIPATING 32
--   AWARE         28
--   TOTAL         80
--
-- Nucleus ID: a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a101
-- Find it in the app under the "Demo Cluster" cluster.
