const chromium = require('chrome-aws-lambda');
const puppeteer = chromium.puppeteer;
const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 정적 파일 제공
app.use(express.static('public'));

// 검색 API
app.get('/api/search', async (req, res) => {
  const keyword = req.query.keyword;
  const logs = [];

  const addLog = (message, type = 'info') => {
    logs.push({ message, type, timestamp: new Date().toISOString() });
  };

  if (!keyword) {
    addLog('검색어가 제공되지 않았습니다.', 'error');
    return res.json({ rawdata: null, logs });
  }

  let browser = null;
  try {
    addLog('브라우저를 시작하는 중...');
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    addLog('새 페이지를 생성했습니다.');
    const page = await browser.newPage();

    // 타임아웃 설정
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    // User Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    addLog('네이버 지도 검색 페이지로 이동하는 중...');
    await page.goto('https://map.naver.com/v5', {
      waitUntil: 'networkidle0'
    });

    // 검색창 대기 및 클릭
    addLog('검색창을 찾는 중...');
    await page.waitForSelector('.input_search');
    await page.click('.input_search');

    // 검색어 입력
    addLog('검색어를 입력하는 중...');
    await page.keyboard.type(keyword);
    await page.keyboard.press('Enter');

    // iframe 로딩 대기
    addLog('검색 결과를 기다리는 중...');
    await page.waitForTimeout(2000);

    // iframe 찾기 시도
    const frame = await page.frames().find(f => f.name() === 'searchIframe');
    if (!frame) {
      throw new Error('검색 결과 프레임을 찾을 수 없습니다.');
    }
    addLog('검색 결과 프레임을 찾았습니다.');

    // 페이지 번호 추출
    addLog('페이지 정보를 확인하는 중...');
    const pageNumbers = await frame.evaluate(() => {
      const pageButtons = Array.from(document.querySelectorAll('.zRM9F .mBN2s'));
      return pageButtons
        .filter(btn => !btn.classList.contains('qxokY'))
        .map(btn => {
          const num = parseInt(btn.textContent.trim());
          return isNaN(num) ? null : num;
        })
        .filter(num => num !== null);
    });

    // 현재 페이지(1) 추가
    pageNumbers.unshift(1);
    
    if (!pageNumbers.length) {
      pageNumbers.push(1);
    }
    addLog(`총 ${pageNumbers.length}개의 페이지를 발견했습니다.`);

    // 모든 페이지의 데이터 수집
    const allData = [];
    for (const pageNum of pageNumbers) {
      addLog(`${pageNum}페이지 처리 중...`);
      
      // 페이지 버튼 클릭
      if (pageNum > 1) {
        await frame.evaluate((num) => {
          const buttons = Array.from(document.querySelectorAll('.zRM9F .mBN2s'));
          const targetButton = buttons.find(btn => parseInt(btn.textContent.trim()) === num);
          if (targetButton) targetButton.click();
        }, pageNum);
        
        // 페이지 전환 대기
        await page.waitForTimeout(2000);
      }

      // Apollo State 데이터 추출
      addLog(`${pageNum}페이지 데이터를 추출하는 중...`);
      const pageData = await frame.evaluate(() => {
        return window.__APOLLO_STATE__;
      });

      if (pageData) {
        allData.push({ page: pageNum, data: pageData });
        addLog(`${pageNum}페이지 데이터 추출 완료`, 'success');
      } else {
        addLog(`${pageNum}페이지 데이터 추출 실패`, 'error');
      }

      // 다음 페이지 이동 전 대기
      if (pageNum < Math.max(...pageNumbers)) {
        await page.waitForTimeout(1000);
      }
    }

    if (allData.length === 0) {
      addLog('데이터 추출 실패', 'error');
      await browser.close();
      return res.json({ rawdata: null, logs });
    }

    addLog(`총 ${allData.length}개 페이지의 데이터 추출 완료`, 'success');
    await browser.close();
    addLog('브라우저를 종료했습니다.');
    return res.json({ rawdata: allData, logs });

  } catch (error) {
    addLog(`오류가 발생했습니다: ${error.message}`, 'error');
    if (browser) {
      await browser.close();
      addLog('브라우저를 종료했습니다.');
    }
    return res.status(500).json({ error: error.message, logs });
  }
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});