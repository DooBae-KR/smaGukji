package com.smagukji.backend.repository;

import com.smagukji.backend.domain.AssetCategory;
import com.smagukji.backend.domain.AssetImage;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AssetImageRepository extends JpaRepository<AssetImage, UUID> {

    Optional<AssetImage> findByCategoryAndName(AssetCategory category, String name);

    List<AssetImageSummary> findAllByCategoryOrderByNameAsc(AssetCategory category);

    List<AssetImageSummary> findAllByOrderByCategoryAscNameAsc();

    long countByCategory(AssetCategory category);

    /**
     * 내용이 그대로인지만 확인한다. bytea 를 읽지 않으므로 재적재 시 대부분의 파일을 저렴하게 건너뛸 수 있다.
     */
    @Query("select i.id from AssetImage i "
            + "where i.category = :category and i.name = :name and i.sha256 = :sha256")
    Optional<UUID> findUnchangedId(@Param("category") AssetCategory category,
            @Param("name") String name,
            @Param("sha256") String sha256);
}
