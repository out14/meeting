# 요정 정모 배포 가이드 (AWS EC2 + RDS, IP 접속)

EC2 한 대에 도커로 화면과 API 서버를 올리고, DB는 RDS(MySQL)를 씁니다. 처음 한 번은 1~8단계를 순서대로 하고, 이후 업데이트는 [9. 업데이트 배포](#9-업데이트-배포)만 하면 됩니다. [11. 자동 배포](#11-자동-배포-cicd-github-actions)를 설정하면 `main` 에 푸시하는 것만으로 배포됩니다.

```
사용자 ──HTTP:80──▶ EC2 (도커)
                     ├─ web 컨테이너: Nginx ─┬─ /      → 화면 파일
                     │                      └─ /api   → server 컨테이너
                     └─ server 컨테이너: Node API (시작할 때 DB 마이그레이션 자동)
                                             │
                                             ▼
                                  RDS MySQL (EC2에서만 접속 가능)
```

EC2에는 **도커만** 설치합니다. Node, Nginx 설치와 서버 상시 실행·자동 재시작은 컨테이너가 맡습니다. 관련 파일은 `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`, `deploy/nginx.conf` 입니다.

> **비용:** EC2·RDS 무료 사용 조건(프리 티어/크레딧)은 AWS 계정을 만든 시기에 따라 다릅니다. 시작 전에 콘솔의 **결제 및 비용 관리 → 프리 티어**에서 확인하세요. 탄력적 IP(고정 IP)는 시간당 소액 요금이 붙습니다.

---

## 1. EC2 만들기

AWS 콘솔 → **EC2 → 인스턴스 시작**

| 항목 | 값 |
|---|---|
| 이름 | `meeting` |
| OS 이미지 | **Ubuntu Server 24.04 LTS** |
| 인스턴스 유형 | `t3.micro` (또는 프리 티어 표시가 있는 것) |
| 키 페어 | 새로 만들기 → `.pem` 파일 다운로드 (SSH 접속에 필요, 잃어버리면 접속 불가) |
| 네트워크 설정 | **SSH 트래픽 허용: 내 IP**, **인터넷에서 HTTP 트래픽 허용** 체크 |
| 스토리지 | 기본값(8GB)도 되지만 여유 있게 16GB 권장 |

### 고정 IP(탄력적 IP) 붙이기
EC2를 껐다 켜면 IP가 바뀝니다. 메일 속 비밀번호 재설정 링크가 IP를 쓰므로 고정해 둡니다.

EC2 → **탄력적 IP → 탄력적 IP 주소 할당 → 할당** → 만든 IP 선택 → **작업 → 탄력적 IP 주소 연결** → 인스턴스 `meeting` 선택

이후 이 문서의 `<EC2_IP>`는 이 고정 IP입니다.

---

## 2. RDS(MySQL) 만들기

RDS는 AWS가 관리해 주는 MySQL 서버입니다. 코드는 그대로이고 접속 주소만 바뀝니다. 인터넷에서는 접속할 수 없게 막고, **EC2에서만 접속**하게 만듭니다.

AWS 콘솔 → **RDS → 데이터베이스 생성**

| 항목 | 값 |
|---|---|
| 생성 방식 | **전체 구성** (예전 콘솔에서는 "표준 생성") |
| 엔진 | **MySQL**, 버전 8.4.x (최신) |
| 템플릿 | **프리 티어** (없으면 개발/테스트) |
| DB 인스턴스 식별자 | `meeting-db` |
| 마스터 사용자 이름 | `admin` |
| 마스터 암호 | 직접 입력 (긴 암호, 따로 적어 두기) |
| 인스턴스 클래스 | `db.t4g.micro` 또는 `db.t3.micro` |
| 스토리지 | gp3, 20GB, **스토리지 자동 조정 끄기** |
| 연결 | **EC2 컴퓨팅 리소스에 연결** → 인스턴스 `meeting` 선택 |
| 퍼블릭 액세스 | **아니요** (위에서 EC2 연결을 고르면 자동) |

나머지는 기본값으로 두고 **데이터베이스 생성**을 누릅니다. 상태가 **사용 가능**이 될 때까지 5~10분 걸립니다.

만들어지면 데이터베이스 상세 화면 → **연결 및 보안**의 **엔드포인트**(예: `meeting-db.xxxx.ap-northeast-2.rds.amazonaws.com`)를 복사해 둡니다. 이후 `<RDS_ENDPOINT>`입니다.

> "EC2 컴퓨팅 리소스에 연결"을 고르면 AWS가 보안 그룹을 자동으로 만들어, **이 EC2에서 오는 3306 포트 접속만** 허용합니다. 내 컴퓨터에서 RDS에 바로 접속할 수 없는 것이 정상입니다.

---

## 3. EC2 접속 & 도커 설치

내 컴퓨터 터미널에서 (`.pem` 파일이 있는 폴더에서):

```bash
chmod 400 meeting-key.pem        # 처음 한 번. 키 파일을 나만 읽을 수 있게 (안 하면 접속 거부)
ssh -i meeting-key.pem ubuntu@<EC2_IP>
```

처음 접속할 때 `yes/no` 를 물으면 `yes`. `ubuntu@ip-…:~$` 가 보이면 EC2 안입니다. 이하 모든 명령은 EC2에서 실행합니다.

```bash
# 메모리가 1GB 라 이미지 빌드 중 부족하지 않도록 스왑 2GB 추가
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 도커 설치 (docker compose 포함)
curl -fsSL https://get.docker.com | sudo sh
# sudo 없이 docker 를 쓰도록 권한 추가 → 적용하려면 접속을 끊었다가 다시 접속
sudo usermod -aG docker ubuntu
exit
```

다시 접속한 뒤 확인:

```bash
ssh -i meeting-key.pem ubuntu@<EC2_IP>
docker -v && docker compose version
```

---

## 4. 코드 받기

### GitHub 저장소가 비공개(private)라면: 배포 키 등록
```bash
ssh-keygen -t ed25519 -C "meeting-ec2" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
출력된 한 줄을 GitHub 저장소 → **Settings → Deploy keys → Add deploy key**에 붙여 넣습니다(쓰기 권한은 체크하지 않음).

### 받기
```bash
cd ~
git clone git@github.com:<계정>/<저장소>.git meeting   # 공개 저장소면 https 주소도 됨
cd meeting
```

---

## 5. RDS에 앱 전용 계정 만들기

마스터 계정(`admin`)은 관리용으로만 두고, 앱은 권한이 좁은 전용 계정을 씁니다. MySQL 클라이언트를 설치하지 않고 도커로 잠깐 띄워 접속합니다.

```bash
docker run -it --rm mysql:8.4 mysql -h <RDS_ENDPOINT> -u admin -p --ssl-mode=REQUIRED
```
마스터 암호를 입력하고 접속되면:

```sql
CREATE DATABASE meeting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'meeting_app'@'%' IDENTIFIED BY '여기에-앱용-긴-암호';
GRANT ALL PRIVILEGES ON meeting.* TO 'meeting_app'@'%';
EXIT;
```

> 접속이 안 되고 멈춰 있으면 RDS 보안 그룹 문제입니다. RDS 상세 → **연결된 컴퓨팅 리소스**에 `meeting` EC2가 있는지 확인하세요.

---

## 6. 운영용 `server/.env` 만들기

필요한 비밀값 두 개를 도커로 만듭니다 (EC2에 Node 를 설치하지 않으므로).

```bash
cd ~/meeting

# 토큰 서명 키 (출력값을 TOKEN_SECRET 에)
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 운영용 관리자 비밀번호 해시 (출력값을 ADMIN_PASSWORD_HASH 에)
# 명령 맨 앞에 공백을 넣으면 셸 기록에 비밀번호가 남지 않습니다
 docker run --rm -v "$PWD/server:/app" -w /app node:22-alpine node scripts/hashPassword.js '여기에-운영용-관리자-비밀번호'
```

`.env` 작성:

```bash
nano ~/meeting/server/.env
```

```ini
# RDS
DB_HOST=<RDS_ENDPOINT>
DB_PORT=3306
DB_USER=meeting_app
DB_PASSWORD=5단계에서-정한-앱용-암호
DB_NAME=meeting
DB_SSL=true

# 사이트 주소 (메일 속 링크, CORS)
APP_URL=http://<EC2_IP>
CLIENT_ORIGIN=http://<EC2_IP>

# 관리자 계정 / 토큰
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=위에서-만든-해시
TOKEN_SECRET=위에서-만든-키
ADMIN_TOKEN_TTL_HOURS=1
USER_TOKEN_TTL_HOURS=1

# 메일 (로컬 server/.env 의 값 그대로)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=보내는주소@gmail.com
SMTP_PASS=Gmail-앱-비밀번호
MAIL_FROM="요정 정모 <보내는주소@gmail.com>"
```

`PORT`, `NODE_ENV`, `TRUST_PROXY` 는 `docker-compose.yml` 에서 정하므로 넣지 않아도 됩니다.

저장(`Ctrl+O`, `Enter`) 후 나가기(`Ctrl+X`), 그리고 본인만 읽을 수 있게:

```bash
chmod 600 ~/meeting/server/.env
```

---

## 7. 첫 배포

```bash
cd ~/meeting
docker compose up -d --build
```

처음에는 이미지를 만드느라 5~10분 걸립니다. 끝나면 상태 확인:

```bash
docker compose ps                 # web, server 둘 다 Up 이면 정상
docker compose logs server        # "DB 초기화 완료", "DB 연결 성공!", "Server Running" 이 보이면 성공
```

컨테이너는 `restart: unless-stopped` 로 설정되어 있어, 서버가 죽거나 EC2가 재부팅돼도 자동으로 다시 뜹니다.

---

## 8. 확인

| 확인 | 방법 |
|---|---|
| API | `curl http://<EC2_IP>/api/health` → `{"ok":true}` |
| 화면 | 브라우저에서 `http://<EC2_IP>` → 캘린더가 보이면 성공 |
| 관리자 | 상단 **관리자** → `admin` / 6단계의 운영용 비밀번호 |
| 회원 | 회원가입 → 모임 생성 → 투표 |
| 메일 | 비밀번호 찾기 → 메일 속 링크가 `http://<EC2_IP>/find-password/reset?...` 로 열리는지 |

---

## 9. 업데이트 배포

로컬에서 git push 한 뒤, EC2에서:

```bash
cd ~/meeting && bash deploy/update.sh
```

최신 코드 받기 → 이미지 다시 빌드 → 컨테이너 교체를 한 번에 합니다. DB 마이그레이션은 server 컨테이너가 뜰 때 자동으로 실행됩니다.

`server/.env` 만 바꿨을 때는 다시 빌드할 필요 없이:

```bash
docker compose up -d --force-recreate server
```

---

## 10. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 화면은 뜨는데 데이터가 안 나옴 / 502 | `docker compose logs server` 로 서버 오류 확인 |
| `DB 연결 실패` | `.env` 의 `DB_HOST`·계정·암호, `DB_SSL=true`, RDS 보안 그룹(EC2 연결) |
| 접속이 아예 안 됨 | EC2 보안 그룹에 HTTP(80) 허용, `docker compose ps` 로 web 이 Up 인지 |
| 빌드 중 멈추거나 `Killed` | 메모리 부족. 3단계 스왑이 켜졌는지 `free -h` 로 확인 |
| 메일이 안 옴 | `docker compose logs server` 에서 `재설정 메일 발송 실패` 내용 확인 |
| 상태 보기 / 재시작 | `docker compose ps`, `docker compose restart server` |
| 실시간 로그 | `docker compose logs -f server` (나가기 `Ctrl+C`) |

---

## 11. 자동 배포 (CI/CD, GitHub Actions)

`main` 에 푸시하면 GitHub 이 테스트·빌드를 돌리고, 통과하면 EC2 에 접속해 `deploy/update.sh` 를 실행합니다. 설정은 `.github/workflows/ci-cd.yml` 에 있습니다.

```
main 푸시 → ① 테스트·린트·빌드 (실패하면 중단) → ② EC2 에 SSH 접속 → update.sh 실행 → ③ /api/health 확인
```

다른 브랜치나 PR 은 ①만 실행합니다. 처음 한 번 아래 설정이 필요합니다.

### 11-1. 배포 전용 키 만들기 (내 맥에서)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/meeting-deploy -N "" -C "github-actions-deploy"
```
`~/.ssh/meeting-deploy`(비밀 키)와 `~/.ssh/meeting-deploy.pub`(공개 키)가 만들어집니다.

### 11-2. EC2 에 "배포만 가능한 키"로 등록 (내 맥에서)
이 키로 접속하면 어떤 명령을 보내도 `deploy/update.sh` 만 실행되도록 묶습니다. 키가 유출돼도 서버를 마음대로 조작할 수 없습니다.

```bash
cd 키파일이-있는-폴더   # meeting-key.pem 이 있는 곳
LINE="command=\"cd /home/ubuntu/meeting && bash deploy/update.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat ~/.ssh/meeting-deploy.pub)"
ssh -i meeting-key.pem ubuntu@<EC2_IP> "echo '$LINE' >> ~/.ssh/authorized_keys"
```

확인: 이 키로 접속하면 바로 배포가 실행되고 끝나야 합니다 (셸이 열리지 않음).
```bash
ssh -i ~/.ssh/meeting-deploy ubuntu@<EC2_IP>
```

### 11-3. 서버 지문 확인 (내 맥에서)
가짜 서버에 접속하지 않도록 EC2 의 지문을 GitHub 에 등록해 둡니다.
```bash
ssh-keyscan -t ed25519 <EC2_IP>
```
`<EC2_IP> ssh-ed25519 AAAA...` 로 시작하는 한 줄을 복사합니다.

### 11-4. GitHub Secrets 등록
GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 세 개를 만듭니다.

| 이름 | 값 |
|---|---|
| `EC2_HOST` | `<EC2_IP>` |
| `EC2_SSH_KEY` | `cat ~/.ssh/meeting-deploy` 출력 전체 (`-----BEGIN` 줄부터 `-----END` 줄까지) |
| `EC2_KNOWN_HOSTS` | 11-3 에서 복사한 한 줄 |

### 11-5. EC2 보안 그룹: SSH 를 GitHub 에서 접속 가능하게
GitHub 서버는 IP 가 계속 바뀌므로 SSH(22) 를 전체에 엽니다. Ubuntu EC2 는 비밀번호 로그인이 꺼져 있어 **키가 있어야만** 접속됩니다.

EC2 → 보안 그룹 → (인스턴스의 보안 그룹) → 인바운드 규칙 편집 → SSH 규칙의 소스를 **Anywhere-IPv4 (0.0.0.0/0)** 로 → 저장

### 11-6. 확인
`main` 에 푸시한 뒤 GitHub 저장소 → **Actions** 탭에서 `CI/CD` 실행을 엽니다. `테스트 · 빌드`와 `EC2 배포`가 모두 초록색이면 성공입니다.

| 실패한 단계 | 확인할 것 |
|---|---|
| 테스트 · 빌드 | 로그의 실패한 테스트·린트 오류를 고친 뒤 다시 푸시 (배포는 되지 않음) |
| SSH 접속 (`Permission denied`) | `EC2_SSH_KEY` 가 비밀 키 전체인지, 11-2 를 실행했는지 |
| SSH 접속 (`Host key verification failed`) | `EC2_KNOWN_HOSTS` 를 11-3 의 한 줄로 다시 등록 |
| SSH 접속 (시간 초과) | 11-5 보안 그룹 SSH 규칙 |
| 배포 확인 | EC2 에서 `docker compose logs server` |

---

## 참고: 지금은 HTTP 접속입니다

IP로 접속하면 HTTPS 인증서를 받을 수 없어, 로그인 비밀번호가 **암호화되지 않고** 전송됩니다. 지인끼리 잠깐 쓰는 용도라면 괜찮지만, 도메인을 구하면 HTTPS로 바꾸세요. 도커 구성에서는 web 컨테이너에 인증서(443)를 붙이는 작업이 필요하니, 도메인이 생기면 그때 설정을 추가합니다.
