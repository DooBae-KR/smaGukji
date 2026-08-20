package com.smagukji.backend.config;

import java.util.List;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Flyway 가 손댈 수 없는 스키마 마무리 작업.
 *
 * <p>{@code flyway_schema_history} 는 Supabase 의 기본 권한 때문에 {@code anon} 에 열려 있고
 * RLS 도 꺼져 있다. 프론트에 anon 키가 나가면 마이그레이션 이름과 순서가 그대로 읽히므로 닫아야 한다.
 *
 * <p>그런데 이 일을 마이그레이션 파일 안에서 하면 멈춘다. Flyway 는 마이그레이션이 도는 동안
 * <b>별도 커넥션</b>으로 이력 테이블에 락을 걸어두기 때문에, 같은 시점에 그 테이블을
 * {@code ALTER} 하면 자기 자신의 락을 기다리다 statement timeout(57014) 으로 죽는다.
 * 그래서 마이그레이션이 모두 끝나고 락이 풀린 «기동 완료 후»에 여기서 처리한다.
 *
 * <p>매 기동마다 돌지만 두 문장 모두 여러 번 실행해도 결과가 같다.
 * 실패해도 앱을 죽이지 않는다. 로컬 Postgres 처럼 Supabase 역할이 없는 환경도 있기 때문이다.
 */
@Component
public class SchemaHardening {

    private static final Logger log = LoggerFactory.getLogger(SchemaHardening.class);

    /** Supabase 가 PostgREST 에 쓰는 역할. 이 역할이 없으면 Supabase 가 아니므로 건너뛴다. */
    private static final String[] EXPOSED_ROLES = {"anon", "authenticated"};

    private final JdbcTemplate jdbc;

    public SchemaHardening(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void secureFlywayHistory() {
        for (String role : EXPOSED_ROLES) {
            if (!roleExists(role)) {
                log.debug("역할 {} 이 없어 이력 테이블 잠금을 건너뜁니다 (Supabase 가 아닌 환경)", role);
                return;
            }
        }

        try {
            // 순서가 중요하다. 권한을 먼저 회수하고 RLS 를 켜야 잠깐이라도 열려 있는 틈이 없다.
            jdbc.execute("revoke all on table public.flyway_schema_history from anon, authenticated");
            jdbc.execute("alter table public.flyway_schema_history enable row level security");
            log.info("마이그레이션 이력 테이블을 anon/authenticated 로부터 차단했습니다.");
        } catch (RuntimeException e) {
            // 앱은 계속 뜬다. 다만 이력이 노출된 채로 도는 것이므로 경고로 남긴다.
            log.warn("마이그레이션 이력 테이블 잠금 실패 — anon 키로 이력이 읽힐 수 있습니다: {}",
                    e.getMessage());
        }
    }

    /**
     * 기동할 때마다 «인터넷에 열린 것이 없는지» 훑는다.
     *
     * <p>Supabase 는 public 스키마의 새 테이블에 anon·authenticated 전체 권한을 자동으로 붙인다.
     * V21 에서 그 기본 설정을 껐지만, 대시보드에서 테이블을 만들거나 설정이 되돌아가면
     * 다시 열릴 수 있다. 그때 조용히 공개되는 것보다 로그에 남는 편이 낫다.
     *
     * <p>RLS 가 꺼진 테이블은 정책이 없어도 통째로 읽힌다. 그래서 따로 본다.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void auditPublicExposure() {
        if (!roleExists("anon")) {
            return;
        }
        try {
            List<String> openToAnon = jdbc.queryForList("""
                    select c.relname
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and has_table_privilege('anon', c.oid, 'select')
                     order by 1
                    """, String.class);

            List<String> rlsOff = jdbc.queryForList("""
                    select c.relname
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and not c.relrowsecurity
                     order by 1
                    """, String.class);

            if (!openToAnon.isEmpty()) {
                log.warn("⚠️ anon 이 읽을 수 있는 테이블이 있습니다: {} — 정책이 없으면 인터넷에 공개됩니다.",
                        String.join(", ", openToAnon));
            }
            if (!rlsOff.isEmpty()) {
                log.warn("⚠️ RLS 가 꺼진 테이블이 있습니다: {} — 권한이 있으면 통째로 읽힙니다.",
                        String.join(", ", rlsOff));
            }
            if (openToAnon.isEmpty() && rlsOff.isEmpty()) {
                log.info("공개 노출 점검 통과 — anon 이 읽을 수 있는 테이블이 없고 RLS 도 모두 켜져 있습니다.");
            }
        } catch (RuntimeException e) {
            log.warn("공개 노출 점검 실패: {}", e.getMessage());
        }
    }

    private boolean roleExists(String role) {
        Boolean found = jdbc.queryForObject(
                "select exists (select 1 from pg_roles where rolname = ?)", Boolean.class, role);
        return Boolean.TRUE.equals(found);
    }
}
