package com.smagukji.backend.repository;

import com.smagukji.backend.domain.AssetCategory;
import java.util.UUID;

/** bytea 본문을 제외한 목록용 프로젝션. */
public interface AssetImageSummary {

    UUID getId();

    AssetCategory getCategory();

    String getName();

    String getFileName();

    String getContentType();

    int getByteSize();

    String getSha256();

    String getExternalUrl();
}
