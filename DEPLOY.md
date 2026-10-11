# 요정 정모 배포 가이드 (AWS EC2 + RDS, IP 접속)

EC2 한 대에 화면과 API 서버를 올리고, DB는 RDS(MySQL)를 씁니다. 처음 한 번은 1~8단계를 순서대로 하고, 이후 업데이트는 [9. 업데이트 배포](#9-업데이트-배포)만 하면 됩니다.

```
사용자 ──HTTP──▶ EC2: Nginx ─┬─ /      → 화면 파일 (/var/www/meeting)
                             └─ /api   → Node 서버 (127.0.0.1:4000, PM2)
                                             │
                                             ▼
                                  RDS MySQL (EC2에서만 접속 가능)
```

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
| 생성 방식 | 표준 생성 |
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

## 3. EC2 접속 & 프로그램 설치

내 컴퓨터 터미널에서:

```bash
chmod 400 ~/Downloads/meeting-key.pem
ssh -i ~/Downloads/meeting-key.pem ubuntu@<EC2_IP>
```

EC2 안에서(이하 모든 명령은 EC2에서 실행):

```bash
# 메모리가 1GB 라 화면 빌드 중 부족하지 않도록 스왑 2GB 추가
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 기본 프로그램: Nginx, git, rsync, MySQL 클라이언트
sudo apt update && sudo apt install -y nginx git rsync mysql-client

# Node.js 22 (저장소 .nvmrc 와 같은 버전)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# yarn(1.x) 과 PM2(서버 상시 실행)
sudo npm install -g yarn pm2

node -v && yarn -v && pm2 -v
```

---

## 4. 코드 받기

### GitHub 저장소가 비공개(private)라면: 배포 키 등록
```bash
ssh-keygen -t ed25519 -C "meeting-ec2" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
출력된 한 줄을 GitHub 저장소 → **Settings → Deploy keys → Add deploy key**에 붙여 넣습니다(쓰기 권한은 체크하지 않음).

### 받기 & 설치
```bash
cd ~
git clone git@github.com:<계정>/<저장소>.git meeting   # 공개 저장소면 https 주소도 됨
cd meeting
yarn install --frozen-lockfile
```

---

## 5. RDS에 앱 전용 계정 만들기

마스터 계정(`admin`)은 관리용으로만 두고, 앱은 권한이 좁은 전용 계정을 씁니다.

```bash
mysql -h <RDS_ENDPOINT> -u admin -p --ssl-mode=REQUIRED
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

필요한 비밀값 두 개를 먼저 만듭니다.

```bash
cd ~/meeting/server

# 토큰 서명 키 (출력값을 TOKEN_SECRET 에)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 운영용 관리자 비밀번호 해시 (출력값을 ADMIN_PASSWORD_HASH 에)
# 명령 맨 앞에 공백을 넣으면 셸 기록에 비밀번호가 남지 않습니다
 node scripts/hashPassword.js '여기에-운영용-관리자-비밀번호'
```

`.env` 작성:

```bash
nano ~/meeting/server/.env
```

```ini
PORT=4000
NODE_ENV=production

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
# Nginx 뒤에서 실행 → 실제 사용자 IP 로 로그인 시도 제한
TRUST_PROXY=1

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

저장(`Ctrl+O`, `Enter`) 후 나가기(`Ctrl+X`), 그리고 본인만 읽을 수 있게:

```bash
chmod 600 ~/meeting/server/.env
```

---

## 7. 첫 배포

```bash
cd ~/meeting

# 테이블 만들기 (여러 번 실행해도 안전)
yarn db:init

# 화면 빌드 → Nginx 가 읽는 위치로 복사
yarn build
sudo mkdir -p /var/www/meeting
sudo rsync -a --delete client/dist/ /var/www/meeting/

# Nginx 설정
sudo cp deploy/nginx.conf /etc/nginx/sites-available/meeting
sudo ln -sf /etc/nginx/sites-available/meeting /etc/nginx/sites-enabled/meeting
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 서버 실행 + 재부팅해도 자동 시작
pm2 start deploy/ecosystem.config.cjs
pm2 startup          # 출력되는 sudo ... 명령을 복사해 한 번 실행
pm2 save
```

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

최신 코드 받기 → 설치 → 화면 빌드·교체 → DB 마이그레이션 → 서버 재시작을 한 번에 합니다.

---

## 10. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 화면은 뜨는데 데이터가 안 나옴 / 502 | `pm2 logs meeting-server` 로 서버 오류 확인 |
| `DB 연결 실패` | `.env` 의 `DB_HOST`·계정·암호, `DB_SSL=true`, RDS 보안 그룹(EC2 연결) |
| 접속이 아예 안 됨 | EC2 보안 그룹에 HTTP(80) 허용, `sudo systemctl status nginx` |
| 새로고침하면 404 | `/etc/nginx/sites-enabled/meeting` 이 `deploy/nginx.conf` 인지 |
| 메일이 안 옴 | `pm2 logs meeting-server` 에서 `재설정 메일 발송 실패` 내용 확인 |
| 서버 상태 보기 | `pm2 status`, 재시작은 `pm2 restart meeting-server` |

---

## 참고: 지금은 HTTP 접속입니다

IP로 접속하면 HTTPS 인증서를 받을 수 없어, 로그인 비밀번호가 **암호화되지 않고** 전송됩니다. 지인끼리 잠깐 쓰는 용도라면 괜찮지만, 도메인을 구하면 HTTPS로 바꾸세요.

1. 도메인의 A 레코드를 `<EC2_IP>` 로 연결
2. EC2 보안 그룹에 HTTPS(443) 허용
3. `deploy/nginx.conf` 의 `server_name _;` 을 `server_name 도메인;` 으로 바꿔 다시 복사·reload
4. `sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d 도메인`
5. `server/.env` 의 `APP_URL`, `CLIENT_ORIGIN` 을 `https://도메인` 으로 바꾸고 `pm2 restart meeting-server`
