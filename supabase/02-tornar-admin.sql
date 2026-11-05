-- Rode UMA vez, depois de criar sua conta no app (Supabase > SQL Editor).
-- Troque SEU_EMAIL_AQUI pelo e-mail que você usou para criar a conta.
update profiles
   set is_super_admin = true
 where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');

-- Conferir (deve mostrar true):
select nome, is_super_admin from profiles where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');
