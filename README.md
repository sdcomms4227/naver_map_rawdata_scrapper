# 네이버 지도 Rawdata 스크래퍼

네이버 지도에서 검색 결과의 rawdata를 추출하는 웹 애플리케이션입니다.

## 기능

- 키워드 기반 네이버 지도 검색
- 실시간 로그 확인 (WebSocket)
- Rawdata JSON 다운로드
- 다중 페이지 스크래핑 지원

## 기술 스택

- Node.js
- Express
- WebSocket
- Puppeteer
- Railway (배포)

## 설치 방법

1. 저장소 클론:
```bash
git clone https://github.com/sdcomms4227/naver_map_rawdata_scrapper.git
cd naver_map_rawdata_scrapper
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
`.env` 파일 생성:
```
PORT=3000
NODE_ENV=development
```

4. 실행:
```bash
npm start
```

## Railway 배포

1. Railway CLI 설치:
```bash
npm install -g @railway/cli
```

2. Railway 로그인:
```bash
railway login
```

3. 프로젝트 초기화:
```bash
railway init
```

4. 배포:
```bash
railway up
```

## 사용 방법

1. 웹 브라우저에서 애플리케이션 접속
2. 검색어 입력
3. 실시간 로그 확인
4. 추출된 데이터 다운로드

## 주의사항

- 네이버 지도의 이용약관을 준수해주세요
- 과도한 요청은 IP 차단의 원인이 될 수 있습니다
- 상업적 용도로 사용 시 네이버의 승인이 필요할 수 있습니다

## 라이선스

MIT License 