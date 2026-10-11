-- 모임 정보 및 진행 상태
-- stage: VOTE(날짜 투표, vote_deadline 까지) -> PLACE(장소 투표) -> DONE(확정 완료)
CREATE TABLE IF NOT EXISTS meetings (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(32)  NOT NULL UNIQUE,
  title       VARCHAR(100) NOT NULL,
  stage       ENUM('VOTE', 'PLACE', 'DONE') NOT NULL DEFAULT 'VOTE',
  -- 날짜 투표 후보 기간 (모임 생성 시 관리자가 선택, 이 기간의 모든 날짜가 후보가 된다)
  candidate_start DATE NOT NULL,
  candidate_end   DATE NOT NULL,
  -- 날짜 투표 마감 (UTC). 지나면 최다 득표로 자동 확정하고 장소 투표로 넘어간다
  vote_deadline   DATETIME NOT NULL,
  -- 확정된 일정 (날짜 투표를 연속된 날짜 범위로 확정)
  schedule_start  DATE NULL,
  schedule_end    DATE NULL,
  -- 장소 투표 마감 (UTC). 날짜가 확정될 때 정하고(기본 시작일 D-2 23:59), 지나면 최다 득표 지역으로 확정한다
  place_deadline  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 회원. 모임 참여는 로그인한 회원만 할 수 있다 (password_hash = scrypt `salt:hash`)
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(20)  NOT NULL UNIQUE,
  name          VARCHAR(30)  NOT NULL,
  nickname      VARCHAR(30)  NOT NULL,
  -- 비밀번호 찾기용. 가입 시 필수 (이메일 도입 전 가입한 회원은 NULL)
  email         VARCHAR(254) NULL,
  password_hash VARCHAR(161) NOT NULL,
  -- 관리자가 임시 비밀번호를 발급하면 1 (로그인 후 변경 안내)
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  -- 비밀번호 변경/재설정 시 1씩 올려 기존 로그인 토큰을 무효화한다
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_email (email)
);

-- 모임 참여자. 회원은 user_id 로 식별하고, 관리자가 만든 모임장은 token_hash(참여자 토큰의 SHA-256)로 식별한다
CREATE TABLE IF NOT EXISTS meeting_members (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  meeting_id  INT UNSIGNED NOT NULL,
  name        VARCHAR(30)  NOT NULL,
  nickname    VARCHAR(30)  NOT NULL,
  role        ENUM('HOST', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  user_id     INT UNSIGNED NULL,
  token_hash  CHAR(64)     NULL UNIQUE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_member_nickname (meeting_id, nickname),
  UNIQUE KEY uq_member_user (meeting_id, user_id),
  CONSTRAINT fk_member_meeting FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE
);

-- 투표. 모임마다 유형별로 하나씩 존재한다
CREATE TABLE IF NOT EXISTS polls (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  meeting_id          INT UNSIGNED NOT NULL,
  type                ENUM('DATE', 'PLACE') NOT NULL,
  multiple            TINYINT(1) NOT NULL DEFAULT 0,
  status              ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  confirmed_option_id INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_poll_type (meeting_id, type),
  CONSTRAINT fk_poll_meeting FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
);

-- 투표 선택지. 날짜 투표는 date_value, 장소 투표는 label(장소 이름) + memo 를 사용한다
CREATE TABLE IF NOT EXISTS poll_options (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  poll_id     INT UNSIGNED NOT NULL,
  label       VARCHAR(50)  NOT NULL,
  date_value  DATE NULL,
  memo        VARCHAR(100) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  -- 참여자가 제안한 날짜면 제안한 참여자 (후보 기간에서 만들어진 날짜는 NULL)
  proposed_by INT UNSIGNED NULL,
  UNIQUE KEY uq_option_date (poll_id, date_value),
  CONSTRAINT fk_option_poll FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
  CONSTRAINT fk_option_proposer FOREIGN KEY (proposed_by) REFERENCES meeting_members (id) ON DELETE SET NULL
);

-- 참여자별 투표 기록
CREATE TABLE IF NOT EXISTS votes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  poll_id     INT UNSIGNED NOT NULL,
  option_id   INT UNSIGNED NOT NULL,
  member_id   INT UNSIGNED NOT NULL,
  -- 장소 투표에 남긴 의견
  comment     VARCHAR(300) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vote (option_id, member_id),
  CONSTRAINT fk_vote_poll   FOREIGN KEY (poll_id)   REFERENCES polls (id)           ON DELETE CASCADE,
  CONSTRAINT fk_vote_option FOREIGN KEY (option_id) REFERENCES poll_options (id)    ON DELETE CASCADE,
  CONSTRAINT fk_vote_member FOREIGN KEY (member_id) REFERENCES meeting_members (id) ON DELETE CASCADE
);
