package com.smagukji.backend.domain;

/**
 * 이미지 자산 분류. 원본 폴더명과 매핑된다.
 * DB 의 asset_image.category 체크 제약과 값이 일치해야 한다.
 */
public enum AssetCategory {

    GENERAL("장수"),
    TACTIC("전법");

    private final String folderName;

    AssetCategory(String folderName) {
        this.folderName = folderName;
    }

    public String folderName() {
        return folderName;
    }
}
