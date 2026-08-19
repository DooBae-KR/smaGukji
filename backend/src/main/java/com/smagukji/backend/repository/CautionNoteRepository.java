package com.smagukji.backend.repository;

import com.smagukji.backend.domain.CautionNote;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CautionNoteRepository extends JpaRepository<CautionNote, UUID> {

    List<CautionNote> findAllByAllianceIdAndCidOrderByCreatedAtDesc(UUID allianceId, String cid);

    List<CautionNote> findAllByAllianceIdOrderByCreatedAtDesc(UUID allianceId);

    List<CautionNote> findAllByAllianceIdAndResolvedOrderByCreatedAtDesc(
            UUID allianceId, boolean resolved);

    long countByAllianceIdAndCidAndResolvedFalse(UUID allianceId, String cid);
}
