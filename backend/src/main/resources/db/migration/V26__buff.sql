-- 버프·이상 상태 사전.
--
-- 전법 설명에 «회심», «관통», «침묵» 같은 말이 그대로 나오는데, 그게 무슨 뜻인지는
-- 따로 적혀 있지 않았다. 시트에 «버프» 탭이 생겨서 그 설명을 담는다.
--
-- 나중에 전법 설명에서 이 이름들을 찾아 «무슨 효과인지» 를 붙여 보여주거나,
-- 시뮬레이션이 효과를 구분하는 데 쓸 수 있다. 지금은 사전으로만 둔다.

create table buff (
    id          uuid        primary key default gen_random_uuid(),
    name        text        not null,
    -- 한 버프가 여러 분류에 속한다(예: 침묵은 «이상 상태»이자 «제어 상태»).
    categories  text[]      not null default '{}',
    description text        not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint uq_buff_name unique (name),
    constraint ck_buff_description check (length(btrim(description)) > 0),
    constraint ck_buff_categories check (
        categories <@ array['FUNCTIONAL', 'BASIC', 'AILMENT', 'CONTROL', 'SPECIAL_DAMAGE']::text[])
);

create trigger trg_buff_updated_at
    before update on buff
    for each row execute function set_updated_at();

alter table buff enable row level security;

-- 공용 참조 데이터. 로그인했으면 누구나 읽는다. 쓰기는 시트 동기화(Render)가 한다.
create policy buff_select on buff for select to authenticated using (true);

-- V21 에서 기본 권한을 껐으므로 새 테이블은 직접 줘야 한다.
grant select on buff to authenticated;

comment on table buff is '버프·이상 상태 사전. 시트의 «버프» 탭에서 동기화한다';
comment on column buff.categories is
    'FUNCTIONAL 기능성 / BASIC 기본 / AILMENT 이상 상태 / CONTROL 제어 상태 / SPECIAL_DAMAGE 특수 피해';
