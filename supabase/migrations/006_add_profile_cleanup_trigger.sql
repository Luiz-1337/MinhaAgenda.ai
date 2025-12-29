-- Migration: Adiciona trigger para deletar profile quando usuário é deletado do auth.users
-- Isso previne profiles órfãos quando usuários são removidos do sistema
--
-- NOTA: Se houver constraints de foreign key que referenciam profiles com ON DELETE NO ACTION,
-- a deleção do profile falhará. Isso é um comportamento esperado para proteger a integridade
-- dos dados. Nesses casos, será necessário deletar ou atualizar os registros relacionados
-- antes de deletar o usuário do auth.users.

-- Criar função para deletar o profile quando o usuário é deletado
create or replace function "public"."handle_user_deleted"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Deletar o profile correspondente ao usuário deletado
  -- Se houver constraints que impeçam a deleção, o erro será lançado
  delete from "public"."profiles"
  where id = old.id;
  
  return old;
end;
$$;

-- Criar trigger AFTER DELETE no auth.users
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
after delete on auth.users
for each row execute function "public"."handle_user_deleted"();

