-- 마스터 목록 시트에 «결사닁 다짐» 오타가 남아 있어, 동기화가 이를 새 전법으로 만들었다.
-- 카드 이미지 파일명은 이미 «결사의 다짐» 으로 고쳐져 있어서 같은 전법이 둘이 됐다.
--
-- 지금은 동기화가 «한 글자만 다른 이름» 을 오타로 보고 만들지 않으므로 다시 생기지 않는다.
-- 여기서는 이미 들어간 것만 지운다.
--
-- 부대에 장착돼 있으면 외래키 때문에 지워지지 않는다. 그런 경우는 남겨두고
-- 사람이 확인하도록 둔다(조용히 참조를 끊는 것보다 낫다).

delete from tactic
where name = '결사닁 다짐'
  and not exists (select 1 from team_slot_tactic t where t.tactic_id = tactic.id)
  and not exists (select 1 from general g where g.signature_tactic_id = tactic.id);
