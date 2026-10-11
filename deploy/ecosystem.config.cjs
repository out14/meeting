// PM2 설정: Node 서버를 백그라운드에서 계속 실행하고, 죽으면 다시 띄운다
// 실행: pm2 start deploy/ecosystem.config.cjs   (저장소 루트에서)
module.exports = {
  apps: [
    {
      name: 'meeting-server',
      // server/.env 를 읽도록 server 폴더에서 실행한다
      cwd: `${__dirname}/../server`,
      script: 'server.js',
      env: { NODE_ENV: 'production' },
      // 투표 마감 자동 처리(1분 주기)가 겹치지 않도록 한 개만 띄운다
      instances: 1,
      max_memory_restart: '300M',
      time: true,
    },
  ],
}
