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
	// 비밀번호 해싱(BCrypt)만 사용한다. 전체 보안 스택은 아직 필요 없다.
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
//   ./gradlew bootJar -PbuildFrontend   →  frontend 빌드 후 static/ 에 복사
//   ./gradlew bootJar                   →  백엔드만 (개발 중 빠른 반복용)
// Docker 빌드는 프론트를 따로 빌드해 넘겨주므로 이 플래그를 쓰지 않는다.
// ---------------------------------------------------------------
val frontendDir = rootProject.file("../frontend")
val frontendDist = File(frontendDir, "dist")

val npmCommand = if (System.getProperty("os.name").lowercase().contains("win")) "npm.cmd" else "npm"

val installFrontend by tasks.registering(Exec::class) {
	workingDir = frontendDir
	commandLine(npmCommand, "ci", "--no-audit", "--no-fund")
	// package-lock.json 이 그대로면 다시 돌리지 않는다.
	inputs.file(File(frontendDir, "package-lock.json"))
	outputs.dir(File(frontendDir, "node_modules"))
	onlyIf { project.hasProperty("buildFrontend") }
}

val buildFrontend by tasks.registering(Exec::class) {
	dependsOn(installFrontend)
	workingDir = frontendDir
	commandLine(npmCommand, "run", "build")
	inputs.dir(File(frontendDir, "src"))
	inputs.file(File(frontendDir, "index.html"))
	inputs.file(File(frontendDir, "vite.config.ts"))
	outputs.dir(frontendDist)
	onlyIf { project.hasProperty("buildFrontend") }
}

// build/resources/main 을 직접 복사하지 않고 processResources 에 얹는다.
// 직접 쓰면 다른 태스크가 그 디렉터리를 읽을 때 «선언되지 않은 의존» 오류가 난다.
if (project.hasProperty("buildFrontend")) {
	tasks.named<ProcessResources>("processResources") {
		dependsOn(buildFrontend)
		from(frontendDist) {
			into("static")
		}
	}
}
