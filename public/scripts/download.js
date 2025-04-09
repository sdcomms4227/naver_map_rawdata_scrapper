function downloadRawData() {
  const rawdataContent = document.getElementById('rawdataContent');
  if (!rawdataContent || !rawdataContent.textContent) {
    alert('다운로드할 데이터가 없습니다.');
    return;
  }

  try {
    // Create a blob from the rawdata
    const blob = new Blob([rawdataContent.textContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Get current time in GMT+9
    const now = new Date();
    const gmt9Time = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const formattedTime = gmt9Time.toISOString().replace('T', '_').replace(/\.\d+Z$/, '').replace(/:/g, '-');

    // Create a temporary link element
    const link = document.createElement('a');
    link.href = url;
    link.download = `naver_map_rawdata_${formattedTime}.json`;
    
    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('다운로드 중 오류가 발생했습니다:', error);
    alert('다운로드 중 오류가 발생했습니다.');
  }
} 