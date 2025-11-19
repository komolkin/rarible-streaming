CREATE OR REPLACE VIEW creator_stats AS
SELECT
  u.wallet_address,
  u.username,
  u.display_name,
  u.avatar_url,
  u.created_at,
  u.verified,
  (
    SELECT COUNT(*)
    FROM streams s
    WHERE s.creator_address = u.wallet_address
  ) as total_streams,
  (
    SELECT COUNT(*)
    FROM follows f
    WHERE f.following_address = u.wallet_address
  ) as total_followers,
  (
    SELECT COUNT(*)
    FROM stream_views sv
    JOIN streams s ON s.id = sv.stream_id
    WHERE s.creator_address = u.wallet_address
  ) as total_views
FROM users u;

