const puppeteer = require('puppeteer');
const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 정적 파일 제공
app.use(express.static('public'));

// SSE 클라이언트 저장소
const clients = new Set();

// SSE 엔드포인트
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 클라이언트 등록
  clients.add(res);

  // 클라이언트 연결이 끊어졌을 때 처리
  req.on('close', () => {
    clients.delete(res);
  });
});

// 로그 전송 함수
const sendLog = (message, type = 'info') => {
  const log = { message, type };
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(log)}\n\n`);
  });
};

// 기본 검색어 API
app.get('/api/default-keyword', (req, res) => {
  res.json({ keyword: process.env.DEFAULT_SEARCH_KEYWORD });
});

// 검색 API
app.get('/api/search', async (req, res) => {
  const keyword = req.query.keyword;
  const logs = [];

  if (!keyword) {
    sendLog('검색어가 제공되지 않았습니다.', 'error');
    return res.json({ rawdata: null, logs });
  }

  let browser = null;
  try {
    sendLog('브라우저를 시작하는 중...');
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
      headless: true
    });

    sendLog('새 페이지를 생성했습니다.');
    const page = await browser.newPage();

    // 타임아웃 설정
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    // User Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    sendLog('네이버 지도 검색 페이지로 이동하는 중...');
    await page.goto('https://map.naver.com/v5', {
      waitUntil: 'networkidle0'
    });

    // 검색창 대기 및 클릭
    sendLog('검색창을 찾는 중...');
    await page.waitForSelector('.input_search');
    await page.click('.input_search');

    // 검색어 입력
    sendLog('검색어를 입력하는 중...');
    await page.keyboard.type(keyword);
    await page.keyboard.press('Enter');

    // iframe 로딩 대기
    sendLog('검색 결과를 기다리는 중...');
    await page.waitForTimeout(2000);

    // iframe 찾기 시도
    const frame = await page.frames().find(f => f.name() === 'searchIframe');
    if (!frame) {
      throw new Error('검색 결과 프레임을 찾을 수 없습니다.');
    }
    sendLog('검색 결과 프레임을 찾았습니다.');

    // 추가 대기 시간
    sendLog('데이터 로딩을 위해 대기 중...');
    await page.waitForTimeout(2000);

    // 페이지 번호 추출
    sendLog('페이지 정보를 확인하는 중...');
    const pageNumbers = await frame.evaluate(() => {
      const pageButtons = Array.from(document.querySelectorAll('.zRM9F a.mBN2s'));
      return pageButtons.map(btn => {
        const num = parseInt(btn.textContent.trim());
        return isNaN(num) ? null : num;
      }).filter(num => num !== null);
    });

    if (!pageNumbers.length) {
      pageNumbers.push(1); // 페이지 버튼이 없으면 1페이지만 있는 것
    }
    sendLog(`총 ${pageNumbers.length}개의 페이지를 발견했습니다.`);

    // 모든 페이지의 데이터 수집
    const allData = [];
    for (const pageNum of pageNumbers) {
      sendLog(`${pageNum}페이지 처리 중...`);
      
      // 페이지 버튼 클릭
      if (pageNum > 1) {
        await frame.evaluate((num) => {
          const buttons = Array.from(document.querySelectorAll('.zRM9F a.mBN2s'));
          const targetButton = buttons.find(btn => parseInt(btn.textContent.trim()) === num);
          if (targetButton) targetButton.click();
        }, pageNum);
        
        // 페이지 전환 대기
        await page.waitForTimeout(2000);
      }

      // Apollo State 데이터 추출
      sendLog(`${pageNum}페이지 데이터를 추출하는 중...`);
      const pageData = await frame.evaluate(() => {
        return window.__APOLLO_STATE__;
      });

      if (pageData) {
        allData.push({ page: pageNum, data: pageData });
        sendLog(`${pageNum}페이지 데이터 추출 완료`, 'success');
      } else {
        sendLog(`${pageNum}페이지 데이터 추출 실패`, 'error');
      }

      // 다음 페이지 이동 전 대기
      if (pageNum < Math.max(...pageNumbers)) {
        await page.waitForTimeout(1000);
      }
    }

    if (allData.length === 0) {
      sendLog('데이터 추출 실패', 'error');
      await browser.close();
      return res.json({ rawdata: null, logs });
    }

    sendLog(`총 ${allData.length}개 페이지의 데이터 추출 완료`, 'success');
    await browser.close();
    sendLog('브라우저를 종료했습니다.');
    return res.json({ rawdata: allData, logs });

  } catch (error) {
    sendLog(`오류가 발생했습니다: ${error.message}`, 'error');
    if (browser) {
      await browser.close();
      sendLog('브라우저를 종료했습니다.');
    }
    return res.status(500).json({ error: error.message, logs });
  }
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});