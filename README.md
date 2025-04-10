# Naver Map Rawdata Scrapper

네이버 지도에서 검색 결과의 rawdata를 스크래핑하는 웹 애플리케이션입니다.

## 기능

- 네이버 지도 검색 결과의 rawdata 추출
- 실시간 로그 출력 (WebSocket 사용)
- Raw Data 다운로드 기능
- 환경 변수를 통한 설정 관리

## 설치 및 실행

1. 저장소 클론
```bash
git clone https://github.com/your-username/naver_map_rawdata_scrapper.git
cd naver_map_rawdata_scrapper
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
`.env` 파일을 생성하고 다음 내용을 추가합니다:
```
PORT=3000
```

4. 서버 실행
```bash
npm start
```

5. 웹 브라우저에서 접속
```
http://localhost:3000
```

## 환경 변수 구조

| 변수명 | 설명 | 기본값 | 필수 |
|--------|------|--------|------|
| `PORT` | 서버 포트 | `3000` | X |

## 사용 방법

1. 검색어 입력
2. "검색" 버튼 클릭
3. 실시간으로 로그가 표시됩니다
4. 스크래핑이 완료되면 Raw Data가 표시됩니다
5. "Raw Data 다운로드" 버튼을 클릭하여 데이터를 다운로드할 수 있습니다

## 기술 스택

- Node.js
- Express
- Puppeteer
- WebSocket
- HTML/CSS/JavaScript

## 라이센스

MIT 