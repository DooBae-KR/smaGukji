import { useEffect, useState } from 'react'
import { request } from '../api/client'

interface Staff {
  id: string
  name: string
  role: string
  rank: string
  lead: boolean
  hairColor: string
  shirtColor: string
  accentColor: string
  thoughts: string[]
}

interface Team {
  id: string
  code: string
  name: string
  icon?: string
  shortName?: string
  task: string
  report: string
  route?: string
  position: number
  staff: Staff[]
}

/** 직원 아이콘. 별도 이미지 없이 색만으로 구분한다. */
function Avatar({ staff }: { staff: Staff }) {
  return (
    <span className="avatar" title={staff.role}>
      <span className="avatar-hair" style={{ background: staff.hairColor }} />
      <span className="avatar-body" style={{ background: staff.shirtColor }} />
      <span className="avatar-accent" style={{ background: staff.accentColor }} />
    </span>
  )
}

export function AgentPage({ onGoTo }: { onGoTo: (route: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    request<Team[]>('/agent/teams')
      .then(setTeams)
      .catch((e) => setError(e.message))
  }, [])

  // 혼잣말을 일정 간격으로 돌린다. 화면이 살아 있다는 느낌만 주는 용도다.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 4000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="panel">
      <h2>AI 오피스</h2>

      <div className="notice">
        4개 팀이 각자 담당 화면을 맡습니다. 팀 카드를 누르면 해당 기능으로 이동합니다.
        <br />
        <strong>이 오피스는 LLM을 호출하지 않습니다.</strong> 직원 대사와 팀 구성은 전부 DB에 저장된
        값이고, 실제 계산은 각 팀이 가리키는 화면이 수행합니다.
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="team-grid">
        {teams.map((team) => (
          <div key={team.id} className="team-card">
            <div className="team-head">
              <span className="team-icon">{team.icon}</span>
              <div>
                <div className="team-name">{team.name}</div>
                <div className="muted">{team.shortName}</div>
              </div>
            </div>

            <p className="team-task">{team.task}</p>
            <p className="muted team-report">“{team.report}”</p>

            <div className="staff-row">
              {team.staff.map((s) => {
                const thought = s.thoughts.length
                  ? s.thoughts[tick % s.thoughts.length]
                  : null
                return (
                  <div key={s.id} className="staff">
                    <Avatar staff={s} />
                    <div className="staff-info">
                      <span className="staff-name">
                        {s.name}
                        {s.lead && <span className="lead-badge">팀장</span>}
                      </span>
                      <span className="muted staff-role">{s.role}</span>
                      {thought && <span className="thought">{thought}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {team.route && (
              <button className="primary team-go" onClick={() => onGoTo(team.route!)}>
                {team.name} 화면 열기
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
