/**
 * 부팅 화면.
 *
 * <p>백엔드가 깨어날 때까지 보여준다. Render 무료 플랜은 15분 유휴 후 잠들어서
 * 첫 요청이 30초~1분 걸린다. 그동안 빈 화면이나 오류를 보여주면 사용자는
 * 고장난 줄 안다. 무엇을 기다리는지, 얼마나 걸렸는지 그대로 보여준다.
 */
export function LoadingScreen({
  elapsedSeconds,
  error,
  onRetry,
}: {
  elapsedSeconds: number
  error?: string | null
  onRetry?: () => void
}) {
  // 10초를 넘기면 잠든 서버를 깨우는 중일 가능성이 높다. 그때부터 안내를 바꾼다.
  const waking = elapsedSeconds >= 10

  return (
    <div className="boot">
      <div className="boot-inner">
        <div className="boot-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <h1 className="boot-title">천하결전 오피스</h1>

        {error ? (
          <>
            <p className="boot-msg boot-error">서버에 연결하지 못했습니다.</p>
            <p className="boot-sub">{error}</p>
            {onRetry && (
              <button className="primary" onClick={onRetry} style={{ marginTop: 14 }}>
                다시 시도
              </button>
            )}
          </>
        ) : (
          <>
            <p className="boot-msg" aria-live="polite">
              {waking ? '잠들어 있던 서버를 깨우는 중입니다' : '서버에 연결하는 중입니다'}
            </p>
            <p className="boot-sub">
              {waking
                ? '무료 플랜은 첫 접속에 30초~1분이 걸립니다. 그 다음부터는 빠릅니다.'
                : '잠시만 기다려 주세요.'}
            </p>
            <div className="boot-bar" role="progressbar" aria-label="서버 연결 중">
              <span />
            </div>
            {elapsedSeconds >= 3 && (
              <p className="boot-elapsed">{elapsedSeconds}초 경과</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
