-- 관리자가 «관리자» 화면에서 메뉴 노출을 바꾼다.
--
-- V18 은 menu_item 에 읽기만 열어뒀다. 그때는 수정이 Render 의 PATCH /api/menus/{code}
-- 를 거쳤기 때문인데, 이제 프론트가 Supabase 로 직접 가므로 쓰기도 열어야 한다.
--
-- 새로 만들거나 지우는 것은 열지 않는다. 메뉴 목록은 화면 구성과 1:1 이라
-- 코드(라우트)가 없는 메뉴를 만들면 눌러도 아무것도 안 나온다. 그건 마이그레이션의 몫이다.

create policy menu_item_update on menu_item
    for update to authenticated
    using (app_is_admin())
    with check (app_is_admin());

grant update on menu_item to authenticated;

-- 바꿀 수 있는 칸을 좁힌다. code 와 route 가 바뀌면 화면과 연결이 끊어진다.
-- 정책으로는 «어떤 칸을» 바꾸는지 제한할 수 없어 트리거로 되돌린다.
create or replace function app_guard_menu_item()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
    -- postgres(Render·Flyway)로 들어온 변경은 그대로 둔다. 마이그레이션이 써야 하기 때문이다.
    if public.app_login_id() is null then
        return new;
    end if;
    new.code  := old.code;
    new.route := old.route;
    return new;
end
$fn$;

create trigger trg_menu_item_guard
    before update on menu_item
    for each row execute function app_guard_menu_item();

revoke all on function app_guard_menu_item() from public, anon;
grant execute on function app_guard_menu_item() to authenticated;

comment on policy menu_item_update on menu_item is
    '관리자만 메뉴 노출·권한을 바꾼다. code/route 는 트리거가 고정한다';
