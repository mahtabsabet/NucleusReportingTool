-- ============================================================
-- Replace placeholder clusters with the 17 real Alberta clusters.
-- Safe to re-run. Preserves Playwright test fixtures.
-- ============================================================

BEGIN;

-- Step 1: Move any nuclei that point at a soon-to-be-soft-deleted
-- placeholder cluster onto the "Removed From Clustering" cluster.
-- (We must do this BEFORE soft-delete so the FK chain is valid.)
-- First make sure the fallback cluster exists.
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Removed From Clustering', 54.0, -115.0, 6
WHERE NOT EXISTS (
  SELECT 1 FROM clusters WHERE name = 'Removed From Clustering' AND deleted_at IS NULL
);

-- Reassign nuclei whose current cluster is a placeholder (not in the
-- new 17, not a test fixture) to the fallback cluster.
UPDATE nuclei
SET cluster_id = (
  SELECT id FROM clusters WHERE name = 'Removed From Clustering' AND deleted_at IS NULL LIMIT 1
)
WHERE deleted_at IS NULL
  AND id NOT IN ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777')
  AND cluster_id IN (
    SELECT id FROM clusters
    WHERE deleted_at IS NULL
      AND name NOT IN ('Wood Buffalo', 'Removed From Clustering', 'Lesser Slave Lake', 'Lakeland', 'Northern Gates', 'Yellowhead', 'Black Gold / Elk Island', 'Camrose - Lloyd', 'Wheatland', 'Central Alberta', 'Rocky View Bighorn', 'Foothills', 'Crowsnest', 'Cyprus Hills', 'Edmonton', 'Calgary', 'Peace')
      AND id NOT IN ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666')
  );

-- Step 2: Soft-delete placeholder clusters (anything not in the new
-- list and not a test fixture).
UPDATE clusters
SET deleted_at = now()
WHERE deleted_at IS NULL
  AND name NOT IN ('Wood Buffalo', 'Removed From Clustering', 'Lesser Slave Lake', 'Lakeland', 'Northern Gates', 'Yellowhead', 'Black Gold / Elk Island', 'Camrose - Lloyd', 'Wheatland', 'Central Alberta', 'Rocky View Bighorn', 'Foothills', 'Crowsnest', 'Cyprus Hills', 'Edmonton', 'Calgary', 'Peace')
  AND id NOT IN ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666');

-- Step 3: Upsert the 17 real Alberta clusters with computed centroids.
-- Wood Buffalo
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Wood Buffalo', 56.761825, -112.099229, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Wood Buffalo' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 56.761825, center_lng = -112.099229, zoom = 7
WHERE name = 'Wood Buffalo' AND deleted_at IS NULL;

-- Removed From Clustering
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Removed From Clustering', 57.994057, -114.937654, 6
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Removed From Clustering' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 57.994057, center_lng = -114.937654, zoom = 6
WHERE name = 'Removed From Clustering' AND deleted_at IS NULL;

-- Lesser Slave Lake
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Lesser Slave Lake', 55.371385, -114.670601, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Lesser Slave Lake' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 55.371385, center_lng = -114.670601, zoom = 7
WHERE name = 'Lesser Slave Lake' AND deleted_at IS NULL;

-- Lakeland
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Lakeland', 54.211396, -111.864098, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Lakeland' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 54.211396, center_lng = -111.864098, zoom = 8
WHERE name = 'Lakeland' AND deleted_at IS NULL;

-- Northern Gates
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Northern Gates', 54.348480, -113.757140, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Northern Gates' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 54.348480, center_lng = -113.757140, zoom = 7
WHERE name = 'Northern Gates' AND deleted_at IS NULL;

-- Yellowhead
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Yellowhead', 53.169958, -116.812330, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Yellowhead' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 53.169958, center_lng = -116.812330, zoom = 7
WHERE name = 'Yellowhead' AND deleted_at IS NULL;

-- Black Gold / Elk Island
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Black Gold / Elk Island', 53.462854, -113.603592, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Black Gold / Elk Island' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 53.462854, center_lng = -113.603592, zoom = 8
WHERE name = 'Black Gold / Elk Island' AND deleted_at IS NULL;

-- Camrose - Lloyd
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Camrose - Lloyd', 52.989210, -111.800397, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Camrose - Lloyd' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 52.989210, center_lng = -111.800397, zoom = 8
WHERE name = 'Camrose - Lloyd' AND deleted_at IS NULL;

-- Wheatland
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Wheatland', 51.085259, -111.923614, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Wheatland' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 51.085259, center_lng = -111.923614, zoom = 8
WHERE name = 'Wheatland' AND deleted_at IS NULL;

-- Central Alberta
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Central Alberta', 52.425532, -114.774770, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Central Alberta' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 52.425532, center_lng = -114.774770, zoom = 7
WHERE name = 'Central Alberta' AND deleted_at IS NULL;

-- Rocky View Bighorn
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Rocky View Bighorn', 51.249545, -115.476380, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Rocky View Bighorn' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 51.249545, center_lng = -115.476380, zoom = 7
WHERE name = 'Rocky View Bighorn' AND deleted_at IS NULL;

-- Foothills
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Foothills', 50.237565, -114.249503, 9
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Foothills' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 50.237565, center_lng = -114.249503, zoom = 9
WHERE name = 'Foothills' AND deleted_at IS NULL;

-- Crowsnest
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Crowsnest', 49.698831, -113.891435, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Crowsnest' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 49.698831, center_lng = -113.891435, zoom = 8
WHERE name = 'Crowsnest' AND deleted_at IS NULL;

-- Cyprus Hills
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Cyprus Hills', 50.342355, -111.722055, 8
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Cyprus Hills' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 50.342355, center_lng = -111.722055, zoom = 8
WHERE name = 'Cyprus Hills' AND deleted_at IS NULL;

-- Edmonton
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Edmonton', 53.541553, -113.486828, 11
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Edmonton' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 53.541553, center_lng = -113.486828, zoom = 11
WHERE name = 'Edmonton' AND deleted_at IS NULL;

-- Calgary
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Calgary', 51.054463, -114.097157, 11
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Calgary' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 51.054463, center_lng = -114.097157, zoom = 11
WHERE name = 'Calgary' AND deleted_at IS NULL;

-- Peace
INSERT INTO clusters (name, center_lat, center_lng, zoom)
SELECT 'Peace', 54.966825, -118.177107, 7
WHERE NOT EXISTS (SELECT 1 FROM clusters WHERE name = 'Peace' AND deleted_at IS NULL);
UPDATE clusters SET center_lat = 54.966825, center_lng = -118.177107, zoom = 7
WHERE name = 'Peace' AND deleted_at IS NULL;

COMMIT;

-- Sanity-check: list active clusters after running.
SELECT name, center_lat, center_lng, zoom FROM clusters WHERE deleted_at IS NULL ORDER BY name;
