-- Make recipient password optional
ALTER TABLE documents ALTER COLUMN recipient_password_hash DROP NOT NULL;

-- Update trigger to handle null passwords
CREATE OR REPLACE FUNCTION hash_recipient_password()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF new.recipient_password_hash IS NOT NULL AND new.recipient_password_hash != '' THEN
    new.recipient_password_hash := crypt(new.recipient_password_hash, gen_salt('bf'));
  ELSE
    new.recipient_password_hash := NULL;
  END IF;
  RETURN new;
END;
$$;
