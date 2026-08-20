package com.smagukji.backend.config;

import com.smagukji.backend.domain.AccountRole;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Supabase 토큰이 가리키는 사람이 «우리 도메인에서» 누구인지 찾는다.
 *
 * <p>토큰 자체에는 우리 역할이 없다. Supabase 가 넣어주는 {@code role} 은 언제나
 * {@code authenticated} 라는 Postgres 역할이고, 관리자·간부진·동맹원 구분은
 * {@code app_profile} 테이블에 있다. 그래서 토큰의 {@code sub} 로 프로필을 찾아 붙인다.
 *
 * <p>JPA 엔티티를 만들지 않고 JdbcTemplate 을 쓰는 이유는, 이 조회가 인증 필터 안에서
 * 일어나기 때문이다. 영속성 컨텍스트가 열리기 전이라 단순한 조회가 안전하다.
 */
@Component
public class SupabaseProfiles {

    /**
     * 요청을 보낸 사람.
     *
     * @param allianceId 관리자는 비어 있을 수 있다. 시스템 전체 역할이라 소속이 없어도 된다
     */
    public record Actor(UUID userId, String loginId, AccountRole role, UUID allianceId) {

        /** 이 동맹의 인사 데이터를 다룰 수 있나. DB 의 app_can_access_alliance() 와 같은 규칙이다. */
        public boolean canAccess(UUID target) {
            if (!role.canManageHr()) {
                return false;
            }
            if (role.canManageSystem()) {
                return true;   // 관리자는 동맹 제한을 받지 않는다
            }
            return target != null && target.equals(allianceId);
        }
    }

    private final JdbcTemplate jdbc;

    public SupabaseProfiles(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** 중지된 계정은 찾지 못한 것으로 본다. RLS 헬퍼 app_me() 와 같은 판정이다. */
    public Optional<Actor> find(String userId) {
        UUID id;
        try {
            id = UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return jdbc.query(
                        """
                        select user_id, login_id, role, alliance_id
                          from app_profile
                         where user_id = ? and active
                        """,
                        (rs, n) -> new Actor(
                                rs.getObject("user_id", UUID.class),
                                rs.getString("login_id"),
                                AccountRole.valueOf(rs.getString("role")),
                                rs.getObject("alliance_id", UUID.class)),
                        id)
                .stream()
                .findFirst();
    }

    public Optional<Actor> find(Jwt jwt) {
        return jwt == null ? Optional.empty() : find(jwt.getSubject());
    }
}
