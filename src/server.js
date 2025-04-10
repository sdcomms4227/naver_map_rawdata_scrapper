const puppeteer = require('puppeteer');
const express = require('express');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Express 서버 생성
const server = app.listen(port, () => {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.RAILWAY_STATIC_URL || 'localhost';
  console.log(`서버가 ${protocol}://${host}:${port} 에서 실행 중입니다.`);
});

// WebSocket 서버를 Express 서버에 연결
const wss = new WebSocket.Server({ server });

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
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--hide-scrollbars',
        '--disable-notifications',
        '--disable-extensions',
        '--disable-infobars',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    sendLog('새 페이지를 생성했습니다.');
    const page = await browser.newPage();
    
    // 웹 드라이버 감지 방지
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    // User-Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 윈도우 크기 설정
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });

    sendLog('네이버 지도 검색 페이지로 이동하는 중...');
    await page.goto(`https://map.naver.com/v5/search/${encodeURIComponent(keyword)}`, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 60000
    });
    sendLog('검색 페이지 로드 완료');

    // 페이지가 완전히 로드될 때까지 대기
    sendLog('페이지가 완전히 로드될 때까지 대기 중...');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
    
    // JavaScript 실행을 기다림
    sendLog('JavaScript 실행을 기다리는 중...');
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (window.performance.timing.loadEventEnd) {
          resolve();
        } else {
          window.addEventListener('load', resolve);
        }
      });
    });

    // iframe이 동적으로 로드되는 것을 감지
    sendLog('iframe이 로드될 때까지 대기 중...');
    let frameElement = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!frameElement && attempts < maxAttempts) {
      try {
        // iframe이 로드되었는지 확인
        frameElement = await page.evaluate(() => {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            if (iframe.id === 'searchIframe' || iframe.src.includes('search')) {
              return true;
            }
          }
          return false;
        });

        if (frameElement) {
          frameElement = await page.waitForSelector('iframe#searchIframe, iframe[src*="search"]', { 
            timeout: 10000,
            visible: true
          });
          break;
        }
      } catch (error) {
        sendLog(`iframe 찾기 시도 ${attempts + 1}/${maxAttempts} 실패, 재시도 중...`);
      }
      
      // 각 시도마다 5초 대기
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    if (!frameElement) {
      throw new Error('iframe을 찾을 수 없습니다.');
    }

    sendLog('iframe을 찾았습니다.');
    const frame = await frameElement.contentFrame();
    sendLog('iframe 컨텍스트에 접근했습니다.');

    // iframe 컨텐츠가 로드될 때까지 대기
    sendLog('iframe 컨텐츠가 로드될 때까지 대기 중...');
    await frame.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
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