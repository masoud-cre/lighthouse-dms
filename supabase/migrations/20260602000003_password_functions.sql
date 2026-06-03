-- Hash a password using bcrypt
create or replace function verify_password(input_password text, stored_hash text)
returns boolean language sql security definer as $$
  select stored_hash = crypt(input_password, stored_hash);
$$;

-- Trigger to hash recipient password before insert
create or replace function hash_recipient_password()
returns trigger language plpgsql security definer as $$
begin
  new.recipient_password_hash := crypt(new.recipient_password_hash, gen_salt('bf'));
  return new;
end;
$$;

create trigger hash_password_on_insert
  before insert on documents
  for each row execute function hash_recipient_password();
