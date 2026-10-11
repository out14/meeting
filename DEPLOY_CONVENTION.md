# 배포 컨벤션

요정 정모를 고치고 배포할 때 지키는 규칙입니다. 서버를 처음 세팅하는 방법은 [DEPLOY.md](DEPLOY.md)를 보세요.

## 한눈에 보기

```
작업 브랜치에서 수정 → 로컬 확인 → main 에 합치기(푸시) → GitHub Actions 테스트 → 통과 시 EC2 자동 배포 → 배포 확인
```

| 규칙 | 내용 |
|---|---|
| `main` = 운영 | `main` 에 들어간 코드는 곧바로 운영 서버(http://54.252.205.146)에 배포됩니다 |
| 테스트 실패 = 배포 중단 | CI 가 실패하면 배포되지 않고 운영은 이전 버전으로 유지됩니다 |
| 비밀값은 저장소 밖 | `.env`, 비밀번호, 키는 커밋하지 않습니다. 운영 값은 EC2 의 `server/.env` 와 GitHub Secrets 에만 둡니다 |
| 수정은 맥에서만 | EC2 에서 코드를 직접 고치지 않습니다 (다음 자동 배포의 `git pull` 이 실패합니다) |

---

## 1. 브랜치

| 브랜치 | 용도 |
|---|---|
| `main` | 운영. 푸시하면 자동 배포. **강제 푸시(`--force`) 금지** |
| `feat/설명` | 새 기능 (예: `feat/place-deadline`) |
| `fix/설명` | 버그 수정 (예: `fix/calendar-legend`) |
| `hotfix/설명` | 운영 장애 긴급 수정 |
| `chore/설명`, `docs/설명` | 설정·의존성, 문서 |

- 작업은 브랜치에서 하고, 끝나면 `main` 에 합칩니다. 브랜치에 푸시해도 **테스트·빌드만** 돌고 배포는 되지 않으니, 합치기 전에 Actions 결과로 미리 확인할 수 있습니다.
- 혼자 작업할 때는 로컬에서 `git switch main && git merge --ff-only 브랜치 && git push origin main` 으로 합쳐도 됩니다. 함께 작업하면 PR 로 합칩니다.

## 2. 커밋 메시지

- 한국어, 제목 한 줄에 **무엇을 왜** 바꿨는지 씁니다.
- 영역이 분명하면 `영역: 내용` 형식을 씁니다.
- 필요하면 빈 줄 뒤에 본문으로 자세한 내용을 씁니다.

```
장소 투표: 마감 시 동점이면 동점 지역을 모두 보여주기
CI/CD: GitHub Actions 로 테스트·빌드 후 main 푸시 시 EC2 자동 배포
로그인 화면 로고를 320px 로 줄여 로딩 속도 개선 (1.2MB → 108KB)
```

## 3. 배포 전 확인 (로컬)

CI 가 같은 검사를 하지만, 푸시 전에 로컬에서 먼저 확인하면 빠릅니다.

```bash
yarn lint     # 화면 린트
yarn build    # 화면 타입 검사 + 빌드
yarn test     # 서버 테스트 (로컬 MySQL 의 meeting_test DB 를 새로 만듦)
```

화면을 고쳤다면 `yarn dev` 로 띄워 바뀐 화면을 직접 눌러 봅니다.

## 4. 배포

1. `main` 에 푸시합니다.
2. GitHub 저장소 → **Actions** 탭에서 `CI/CD` 실행을 확인합니다. 보통 5~8분 걸립니다.
   - `테스트 · 빌드` → `EC2 배포` 가 모두 초록색이면 배포 완료입니다.
   - 실패하면 GitHub 이 알림 메일을 보냅니다. 실패한 단계의 로그를 보고 고친 뒤 다시 푸시합니다.
3. 배포 중 컨테이너를 교체하는 수십 초 동안 사이트가 잠깐 끊길 수 있습니다. 사람이 적은 시간에 배포합니다.

## 5. 배포 후 확인

| 확인 | 방법 |
|---|---|
| 서버 | http://54.252.205.146/api/health → `{"ok":true}` (Actions 가 자동으로 확인) |
| 화면 | 사이트를 강력 새로고침(`Cmd + Shift + R`) 해서 바뀐 부분 확인 |
| 주요 기능 | 로그인 → 모임 보기 → 투표가 되는지 |
| 로그 | 이상하면 EC2 에서 `cd ~/meeting && docker compose logs --tail 50 server` |

## 6. 환경 변수(.env)

새 설정값이 필요한 코드를 만들 때:

1. `server/.env.example` 에 항목과 설명 주석을 추가합니다 (값은 비워 둠).
2. 필요하면 [DEPLOY.md](DEPLOY.md) 6단계의 `.env` 예시에도 추가합니다.
3. **코드를 푸시하기 전에** EC2 의 `server/.env` 에 값을 먼저 넣습니다. 순서가 바뀌면 배포 직후 서버가 값이 없어 실패할 수 있습니다.

운영 `.env` 만 바꿀 때는 배포 없이 EC2 에서:

```bash
cd ~/meeting
nano server/.env
docker compose up -d --force-recreate server
```

## 7. DB 변경 (마이그레이션)

서버 컨테이너가 뜰 때마다 `server/db/init.js` 가 실행됩니다. 그래서 마이그레이션은 **여러 번 실행해도 안전해야** 합니다.

- 새 테이블은 `schema.sql` 에 `CREATE TABLE IF NOT EXISTS` 로 추가합니다.
- 기존 테이블 변경은 `init.js` 의 `migrate()` 에 `hasColumn` / `columnType` 으로 **이미 적용됐는지 확인한 뒤** 실행합니다.
  ```js
  if (!(await hasColumn(conn, 'meetings', 'new_column'))) {
    await conn.query('ALTER TABLE meetings ADD COLUMN new_column VARCHAR(50) NULL')
    console.log('마이그레이션: meetings.new_column 추가')
  }
  ```
- 새 컬럼은 `NULL` 허용이나 기본값을 둡니다. 기존 데이터가 있어도 실패하지 않게 합니다.
- 컬럼 삭제·이름 변경·데이터 변환처럼 **되돌리기 어려운 변경**은:
  1. 배포 전에 RDS 스냅샷을 만듭니다 (RDS → `meeting-db` → 작업 → 스냅샷 생성).
  2. 가능하면 두 번에 나눠 배포합니다. 먼저 새 컬럼을 추가하고 코드를 옮긴 뒤, 다음 배포에서 옛 컬럼을 지웁니다.
- 로컬 `yarn test` 는 빈 DB 에서 시작하므로, 기존 데이터가 있는 DB 에서도 되는지 로컬 개발 DB(`meeting`)로 한 번 더 띄워 확인합니다.

## 8. 되돌리기 (롤백)

배포 후 문제가 생기면 **문제 커밋을 되돌리는 커밋**을 만들어 푸시합니다. 자동 배포로 이전 상태가 됩니다.

```bash
git revert <문제 커밋 해시>
git push origin main
```

- `git reset` + 강제 푸시로 되돌리지 않습니다 (이력이 사라지고 EC2 의 `git pull` 이 꼬입니다).
- DB 마이그레이션이 포함된 커밋은 코드만 되돌아가고 DB 는 그대로입니다. 필요하면 7번의 스냅샷으로 복구합니다.

## 9. 긴급 수정 (핫픽스)

1. `main` 에서 `hotfix/설명` 브랜치를 만들어 최소한으로 고칩니다.
2. 로컬에서 `yarn test` 를 확인하고 `main` 에 합쳐 푸시합니다. CI 는 건너뛰지 않습니다.
3. 급하게 사이트를 살려야 하면 먼저 8번 롤백을 하고, 그다음 천천히 고칩니다.

## 10. 하지 않는 것

- EC2 에서 코드 직접 수정 / EC2 에서 `git commit`
- `main` 강제 푸시, CI 를 건너뛰는 배포
- 비밀값(`.env`, 비밀번호, 키, Gmail 앱 비밀번호)을 코드·커밋·이슈·채팅에 남기기
- GitHub Secrets 의 배포 키(`EC2_SSH_KEY`)를 다른 용도로 쓰기 (이 키는 EC2 에서 배포만 실행하도록 묶여 있습니다)
- RDS 보안 그룹(`rds-ec2-1`, `ec2-rds-1`) 수정

## 참고: 관련 파일

| 파일 | 역할 |
|---|---|
| `.github/workflows/ci-cd.yml` | CI/CD 정의 (테스트·빌드, EC2 배포) |
| `docker-compose.yml` | 운영 컨테이너 구성 (web, server) |
| `server/Dockerfile`, `client/Dockerfile` | 이미지 빌드 |
| `deploy/nginx.conf` | 화면 서빙 + `/api` 프록시 |
| `deploy/update.sh` | EC2 에서 실행되는 배포 스크립트 (`git pull` → `docker compose up -d --build`) |
| `server/db/init.js` | DB 생성·마이그레이션 (서버 시작 시 자동 실행) |
| `server/.env.example` | 환경 변수 목록 |
