import { useEffect, useRef, useState } from 'react'

/** 주의 사유 입력 모달. 주의 마커를 켤 때 사유 없이는 닫히지 않는다. */
export function CautionModal({
  cid,
  memberName,
  onSubmit,
  onCancel,
}: {
  cid: string
  memberName: string
  onSubmit: (reason: string) => Promise<void>
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = async () => {
    if (!reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason.trim())
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="caution-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="caution-title" style={{ marginTop: 0 }}>
          <span className="marker-dot" style={{ background: '#e8863a' }} /> 주의 사유
        </h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {memberName} <code>{cid}</code>
        </p>

        {error && <div className="error-box">{error}</div>}

        <textarea
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 3주 연속 공헌 0, 공지 미확인"
          rows={5}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          }}
        />
        <p className="muted">
          사유는 지워지지 않고 이력으로 쌓입니다. 나중에 «주의» 화면에서 검색할 수 있습니다.
          <br />
          Ctrl+Enter 로 저장.
        </p>

        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="primary" disabled={busy || !reason.trim()} onClick={submit}>
            주의 켜기
          </button>
          <button disabled={busy} onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
