plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.smagukji"
version = "0.0.1-SNAPSHOT"
description = "Deck simulation backend"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(17)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.flywaydb:flyway-database-postgresql")
	// MemberWeek*.xlsx 파싱
	implementation("org.apache.poi:poi-ooxml:5.5.1")
	// 로그인은 Supabase Auth 가 맡는다. 여기서는 그 토큰(ES256, JWKS 공개키)만 검증한다.
	// 비밀값을 하나도 들고 있지 않아도 되는 것이 이 방식의 장점이다.
	implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
	// BCrypt. 옛 계정 테이블을 다루는 코드가 남아 있는 동안 필요하다.
	implementation("org.springframework.security:spring-security-crypto")
	developmentOnly("org.springframework.boot:spring-boot-devtools")
	runtimeOnly("org.postgresql:postgresql")
	annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")
	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
	useJUnitPlatform()
}


// ---------------------------------------------------------------
// 프론트엔드를 JAR 안에 담아 한 서비스로 배포한다.
//
//   ./gradlew bootJar -PbuildFrontend   →  frontend 를 빌드해 static/ 에 넣는다
//   ./gradlew bootJar                   →  백엔드만 (개발 중 빠른 반복용)
//
// Docker 빌드는 프론트를 별도 스테이지에서 빌드해 src/main/resources/static 으로
// 직접 넣으므로 이 플래그를 쓰지 않는다.
//
// ⚠️ 이 블록 전체를 조건 안에 둔다. 예전에는 태스크를 항상 등록하고 onlyIf 로만 막았는데,
//    그러면 npm 도 frontend 폴더도 없는 Docker 빌드에서 installFrontend 가 실행되어
//    processResources 가 통째로 실패했다. 아예 등록하지 않는 편이 확실하다.
// ---------------------------------------------------------------
if (project.hasProperty("buildFrontend")) {
	val frontendDir = rootProject.file("../frontend")
	val frontendDist = File(frontendDir, "dist")
	val npm = if (System.getProperty("os.name").lowercase().contains("win")) "npm.cmd" else "npm"

	val installFrontend by tasks.registering(Exec::class) {
		workingDir = frontendDir
		commandLine(npm, "ci", "--no-audit", "--no-fund")
		// package-lock.json 이 그대로면 다시 돌리지 않는다.
		inputs.file(File(frontendDir, "package-lock.json"))
		outputs.dir(File(frontendDir, "node_modules"))
	}

	val buildFrontend by tasks.registering(Exec::class) {
		dependsOn(installFrontend)
		workingDir = frontendDir
		commandLine(npm, "run", "build")
		inputs.dir(File(frontendDir, "src"))
		inputs.file(File(frontendDir, "index.html"))
		inputs.file(File(frontendDir, "vite.config.ts"))
		outputs.dir(frontendDist)
	}

	// build/resources/main 을 직접 복사하지 않고 processResources 에 얹는다.
	// 직접 쓰면 다른 태스크가 그 디렉터리를 읽을 때 «선언되지 않은 의존» 오류가 난다.
	tasks.named<ProcessResources>("processResources") {
		dependsOn(buildFrontend)
		from(frontendDist) {
			into("static")
		}
	}
}
