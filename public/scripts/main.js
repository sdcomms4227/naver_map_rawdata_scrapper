function addLog(message, type = 'info') {
  const logsDiv = document.getElementById('logs');
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logsDiv.appendChild(logItem);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

function addScrapingLog(message, type = 'info') {
  const scrapingLogsDiv = document.getElementById('scrapingLogs');
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  scrapingLogsDiv.appendChild(logItem);
  scrapingLogsDiv.scrollTop = scrapingLogsDiv.scrollHeight;
}

// 페이지 로드 시 기본 검색어 설정 및 자동 검색
window.onload = async function() {
  try {
    const response = await fetch('/api/default-keyword');
    const data = await response.json();
    if (data.keyword) {
      document.getElementById('searchInput').value = data.keyword;
      search();
    }
  } catch (error) {
    console.error('Error fetching default keyword:', error);
  }
};

async function search() {
  const searchInput = document.getElementById('searchInput');
  const loadingDiv = document.getElementById('loading');
  const logsDiv = document.getElementById('logs');
  const scrapingLogsDiv = document.getElementById('scrapingLogs');
  const rawdataContent = document.getElementById('rawdataContent');
  
  if (!searchInput.value.trim()) {
    alert('검색어를 입력해주세요.');
    return;
  }

  loadingDiv.style.display = 'block';
  logsDiv.innerHTML = '';
  scrapingLogsDiv.innerHTML = '';
  rawdataContent.textContent = '';

  try {
    addLog('검색을 시작합니다...');
    addLog(`검색어: ${searchInput.value}`);
    
    const response = await fetch(`/api/search?keyword=${encodeURIComponent(searchInput.value)}`);
    addLog('서버에 요청을 보냈습니다.');
    
    const data = await response.json();
    addLog('서버로부터 응답을 받았습니다.');
    
    if (data.rawdata) {
      addLog('Rawdata를 성공적으로 추출했습니다.', 'success');
      // Combine all page rawdata
      const combinedRawData = data.rawdata.reduce((acc, pageData, index) => {
        if (index === 0) return pageData;
        // Merge the data, handling potential conflicts
        return {
          ...acc,
          ...pageData,
          // Merge arrays if they exist
          ...Object.keys(pageData).reduce((merged, key) => {
            if (Array.isArray(acc[key]) && Array.isArray(pageData[key])) {
              merged[key] = [...acc[key], ...pageData[key]];
            }
            return merged;
          }, {})
        };
      }, {});
      rawdataContent.textContent = JSON.stringify(combinedRawData, null, 2);
    } else {
      addLog('Rawdata 추출에 실패했습니다.', 'error');
    }

    // 스크래핑 로그 표시
    if (data.logs) {
      data.logs.forEach(log => {
        addScrapingLog(log.message, log.type);
      });
    }
  } catch (error) {
    addLog(`오류가 발생했습니다: ${error.message}`, 'error');
    console.error('Error:', error);
  } finally {
    loadingDiv.style.display = 'none';
    addLog('검색이 완료되었습니다.');
  }
}

// Enter 키로도 검색 가능하도록 설정
document.getElementById('searchInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    search();
  }
}); 