-- Legacy admin used 'approved'; align with API enum (verified | rejected | pending | submitted).
UPDATE user_profiles
SET verification_status = 'verified'
WHERE verification_status = 'approved';
