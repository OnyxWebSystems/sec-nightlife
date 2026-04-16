-- One-time (optional): remove legacy AccountRole rows that granted a separate "host" identity.
-- Safe to run after Host tab is available to all USER accounts.
DELETE FROM user_roles WHERE role_type = 'host';
