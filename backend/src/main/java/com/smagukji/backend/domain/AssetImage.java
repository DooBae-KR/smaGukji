package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 장수/전법 카드 이미지 원본.
 *
 * <p>{@code data} 는 PNG 바이트 전체를 담으므로 목록 조회에서는 절대 이 엔티티를 그대로 쓰지 말고
 * {@link com.smagukji.backend.repository.AssetImageSummary} 프로젝션을 사용한다.
 */
@Entity
@Table(name = "asset_image")
public class AssetImage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, columnDefinition = "text")
    private AssetCategory category;

    /** 확장자를 제거한 파일명. 예: 관우, 결사의 다짐 */
    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "file_name", nullable = false, columnDefinition = "text")
    private String fileName;

    @Column(name = "content_type", nullable = false, columnDefinition = "text")
    private String contentType = "image/png";

    @Column(name = "byte_size", nullable = false)
    private int byteSize;

    @Column(name = "sha256", nullable = false, columnDefinition = "text")
    private String sha256;

    @Column(name = "data", columnDefinition = "bytea")
    private byte[] data;

    /** Supabase Storage 등 외부로 옮긴 경우의 URL. */
    @Column(name = "external_url", columnDefinition = "text")
    private String externalUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected AssetImage() {
        // JPA 전용
    }

    public AssetImage(AssetCategory category, String name, String fileName, String contentType, byte[] data,
            String sha256) {
        this.category = category;
        this.name = name;
        this.fileName = fileName;
        this.contentType = contentType;
        this.data = data;
        this.byteSize = data.length;
        this.sha256 = sha256;
    }

    /** 원본 파일이 바뀐 경우 내용을 교체한다. */
    public void replaceContent(String fileName, String contentType, byte[] data, String sha256) {
        this.fileName = fileName;
        this.contentType = contentType;
        this.data = data;
        this.byteSize = data.length;
        this.sha256 = sha256;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public AssetCategory getCategory() {
        return category;
    }

    public String getName() {
        return name;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public int getByteSize() {
        return byteSize;
    }

    public String getSha256() {
        return sha256;
    }

    public byte[] getData() {
        return data;
    }

    public String getExternalUrl() {
        return externalUrl;
    }

    public void setExternalUrl(String externalUrl) {
        this.externalUrl = externalUrl;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
