const puppeteer = require('puppeteer');
const express = require('express');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// WebSocket 서버 생성
const wss = new WebSocket.Server({ port: 8080 });

// 정적 파일 제공
app.use(express.static('public'));

// 검색 API
app.get('/api/search', async (req, res) => {
  const keyword = req.query.keyword;
  const logs = [];

  // WebSocket 클라이언트에게 로그 전송 함수
  const sendLog = (message, type = 'info') => {
    const log = { message, type };
    logs.push(log);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(log));
      }
    });
  };

  if (!keyword) {
    sendLog('검색어가 제공되지 않았습니다.', 'error');
    return res.json({ rawdata: null, logs });
  }

  try {
    sendLog('브라우저를 시작하는 중...');
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    sendLog('새 페이지를 생성했습니다.');
    const page = await browser.newPage();

    sendLog('네이버 지도 검색 페이지로 이동하는 중...');
    await page.goto(`https://map.naver.com/v5/search/${encodeURIComponent(keyword)}`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    sendLog('검색 페이지 로드 완료');

    // iframe 찾기
    sendLog('iframe을 찾는 중...');
    const frameElement = await page.waitForSelector('iframe#searchIframe', { timeout: 10000 });
    sendLog('iframe을 찾았습니다.');

    const frame = await frameElement.contentFrame();
    sendLog('iframe 컨텍스트에 접근했습니다.');

    // Wait for iframe content to load
    sendLog('iframe 컨텐츠 로딩을 위해 5초 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get all page numbers
    const pageNumbers = await frame.evaluate(() => {
      const paginationDiv = document.querySelector('.zRM9F');
      if (!paginationDiv) {
        console.log('페이지네이션을 찾을 수 없습니다.');
        return [1]; // 기본적으로 첫 페이지만 처리
      }
      
      const pageLinks = paginationDiv.querySelectorAll('a.mBN2s');
      const numbers = Array.from(pageLinks).map(link => parseInt(link.textContent));
      console.log('발견된 페이지 번호:', numbers);
      return numbers.length > 0 ? numbers : [1];
    });

    sendLog(`총 ${pageNumbers.length}개의 페이지를 발견했습니다.`);

    let allRawData = [];
    
    // Process each page
    for (const pageNum of pageNumbers) {
      sendLog(`${pageNum} 페이지 처리 중...`);
      
      // Click the page number
      await frame.evaluate((pageNum) => {
        const pageLinks = document.querySelectorAll('a.mBN2s');
        for (const link of pageLinks) {
          if (parseInt(link.textContent) === pageNum) {
            link.click();
            break;
          }
        }
      }, pageNum);

      // Wait for page load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get rawdata from current page
      const pageRawData = await frame.evaluate(() => {
        try {
          // 디버깅을 위한 window 객체 정보 출력
          console.log('window 객체 확인:', Object.keys(window));
          
          if (window.__APOLLO_STATE__) {
            console.log('window.__APOLLO_STATE__를 성공적으로 찾았습니다.');
            return window.__APOLLO_STATE__;
          }
          
          // 대체 방법으로 시도
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            if (script.textContent.includes('__APOLLO_STATE__')) {
              console.log('스크립트에서 __APOLLO_STATE__를 발견했습니다.');
              const match = script.textContent.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
              if (match) {
                try {
                  return JSON.parse(match[1]);
                } catch (e) {
                  console.error('JSON 파싱 실패:', e);
                }
              }
            }
          }
          
          console.log('window.__APOLLO_STATE__를 찾을 수 없습니다.');
          return null;
        } catch (e) {
          console.error('window.__APOLLO_STATE__ 접근 중 오류가 발생했습니다:', e);
          return null;
        }
      });

      if (pageRawData) {
        sendLog(`${pageNum} 페이지 rawdata 추출 성공`, 'success');
        allRawData.push(pageRawData);
      } else {
        sendLog(`${pageNum} 페이지 rawdata 추출 실패`, 'error');
      }
    }

    await browser.close();

    if (allRawData.length > 0) {
      sendLog('rawdata 추출이 완료되었습니다.', 'success');
      res.json({ logs, rawdata: allRawData });
    } else {
      sendLog('rawdata 추출에 실패했습니다.', 'error');
      res.json({ logs, rawdata: null });
    }

  } catch (error) {
    sendLog(`오류가 발생했습니다: ${error.message}`, 'error');
    res.json({ logs, rawdata: null });
  }
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
}); 