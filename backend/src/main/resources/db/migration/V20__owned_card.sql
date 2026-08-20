-- 내가 가진 장수·전법.
--
-- 편성 화면에서 «보유한 것만» 골라 쓰기 위한 목록이다. 사람마다 다르므로 계정에 붙는다.
-- 동맹 단위가 아니다. 같은 동맹이어도 남이 뭘 가졌는지 볼 이유가 없다.
--
-- 왜 Supabase 에 두나
--   편성은 동맹원에게 유일한 화면이고, Render 가 잠들어 있어도 떠야 한다.
--   그래서 조회·수정이 전부 여기서 끝나도록 정책만으로 처리한다(RPC 가 필요 없다).

create table owned_card (
    id         uuid        primary key default gen_random_uuid(),
    user_id    uuid        not null references app_profile (user_id) on delete cascade,

    -- 장수와 전법을 한 테이블에 담되, 한 행은 둘 중 하나만 가리킨다.
    -- 이름이 아니라 id 로 묶어서, 나중에 이름이 바뀌어도 보유 목록이 끊기지 않게 한다.
    general_id uuid        references general (id) on delete cascade,
    tactic_id  uuid        references tactic (id) on delete cascade,

    created_at timestamptz not null default now(),

    constraint ck_owned_card_one check (num_nonnulls(general_id, tactic_id) = 1),
    -- 같은 카드를 두 번 등록할 수 없다.
    -- 한쪽이 null 인 행끼리는 유일성 검사에 걸리지 않으므로(Postgres 는 null 을 서로 다르게 본다)
    -- 장수 행과 전법 행이 섞여 있어도 문제가 없다.
    constraint uq_owned_general unique (user_id, general_id),
    constraint uq_owned_tactic  unique (user_id, tactic_id)
);

create index idx_owned_card_user on owned_card (user_id);

alter table owned_card enable row level security;

-- 본인 것만. with check 가 있어야 «남의 이름으로» 등록하는 것도 막힌다.
-- using 만 두면 읽기는 막히지만 insert 는 통과한다.
create policy owned_card_own on owned_card
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- update 는 주지 않는다. 켜고 끄는 것뿐이라 넣거나 지우면 된다.
grant select, insert, delete on owned_card to authenticated;

comment on table owned_card is '계정별 보유 장수·전법. 편성에서 «보유한 것만» 고를 때 쓴다';
comment on column owned_card.general_id is '장수 행이면 채워지고 전법 행이면 비어 있다';
