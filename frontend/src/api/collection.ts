import { supabase } from '../lib/supabase'

/**
 * 내가 가진 장수·전법.
 *
 * <p>편성에서 «보유한 것만» 골라 쓰기 위한 목록이다. 계정마다 다르고, 같은 동맹이어도
 * 남의 것은 보이지 않는다. 막는 것은 DB 정책이며 여기 코드는 화면을 그리는 용도일 뿐이다.
 *
 * <p>이름이 아니라 id 로 다룬다. 장수 이름이 바뀌어도 보유 목록이 끊기지 않게 하기 위해서다.
 */

export type CardKind = 'GENERAL' | 'TACTIC'

export interface OwnedCards {
  /** 보유한 장수 id */
  generals: Set<string>
  /** 보유한 전법 id */
  tactics: Set<string>
}

export const EMPTY_OWNED: OwnedCards = { generals: new Set(), tactics: new Set() }

function fail(error: unknown): never {
  const message = (error as { message?: string })?.message ?? '보유 목록 처리 실패'
  if (/row-level security|permission denied/i.test(message)) {
    throw new Error('보유 목록을 바꿀 권한이 없습니다. 다시 로그인해 주세요.')
  }
  throw new Error(message)
}

/** 로그인한 사람의 보유 목록. 정책이 본인 것만 돌려주므로 조건을 걸 필요가 없다. */
export async function loadOwned(): Promise<OwnedCards> {
  const { data, error } = await supabase.from('owned_card').select('general_id, tactic_id')
  if (error) fail(error)

  const owned: OwnedCards = { generals: new Set(), tactics: new Set() }
  for (const row of data ?? []) {
    if (row.general_id) owned.generals.add(row.general_id)
    else if (row.tactic_id) owned.tactics.add(row.tactic_id)
  }
  return owned
}

/**
 * 여러 장을 한 번에 등록하거나 해제한다.
 *
 * <p>«전체 선택» 이 153장을 한 장씩 보내지 않도록 묶어서 처리한다.
 * user_id 는 정책이 검사하지만 값 자체는 넣어야 하므로 현재 세션에서 가져온다.
 */
export async function setOwned(kind: CardKind, ids: string[], owned: boolean): Promise<void> {
  if (ids.length === 0) return

  const column = kind === 'GENERAL' ? 'general_id' : 'tactic_id'

  if (!owned) {
    const { error } = await supabase.from('owned_card').delete().in(column, ids)
    if (error) fail(error)
    return
  }

  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('로그인이 필요합니다.')

  // 이미 등록된 것이 섞여 있어도 조용히 넘어가야 «전체 선택» 이 실패하지 않는다.
  // 유일 제약(user_id, general_id)에 걸리는 행은 무시한다.
  const { error } = await supabase
    .from('owned_card')
    .upsert(
      ids.map((id) => ({ user_id: userId, [column]: id })),
      { onConflict: `user_id,${column}`, ignoreDuplicates: true },
    )
  if (error) fail(error)
}

/** 한 장만 켜고 끈다. */
export function toggleOwned(kind: CardKind, id: string, owned: boolean): Promise<void> {
  return setOwned(kind, [id], owned)
}
