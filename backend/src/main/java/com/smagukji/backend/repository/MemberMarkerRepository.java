package com.smagukji.backend.repository;

import com.smagukji.backend.domain.MarkerType;
import com.smagukji.backend.domain.MemberMarker;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberMarkerRepository extends JpaRepository<MemberMarker, UUID> {

    Optional<MemberMarker> findByAllianceIdAndCidAndMarkerType(
            UUID allianceId, String cid, MarkerType markerType);

    List<MemberMarker> findAllByAllianceIdAndEnabledTrue(UUID allianceId);

    List<MemberMarker> findAllByAllianceIdAndMarkerTypeAndEnabledTrue(
            UUID allianceId, MarkerType markerType);

    List<MemberMarker> findAllByAllianceIdAndCid(UUID allianceId, String cid);
}
