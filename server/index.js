const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS 설정 (모든 도메인 허용)
app.use(cors({
  origin: '*', // 모든 도메인 허용
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// In-memory storage (나중에 DB로 변경 가능)
let contents = [];
let nextId = 1;

// API 키 저장소 (환경변수에서 초기값 로드)
let apiKeys = {
  gemini: process.env.GEMINI_API_KEY || null,
  openai: process.env.OPENAI_API_KEY || null
};

// 서버 시작 시 API 키 상태 로그
if (apiKeys.gemini) {
  console.log('✅ Gemini API 키 환경변수에서 로드됨');
}
if (apiKeys.openai) {
  console.log('✅ OpenAI API 키 환경변수에서 로드됨');
}

// 비밀번호 인증 비활성화됨
app.post('/auth/verify', (_req, res) => {
  res.status(410).json({
    success: false,
    error: '비밀번호 인증이 비활성화되었습니다.'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Hospital AI API Server is running',
    timestamp: new Date().toISOString(),
    apiKeys: {
      gemini: !!apiKeys.gemini,
      openai: !!apiKeys.openai
    }
  });
});

// API 키 저장
app.post('/api-keys/save', (req, res) => {
  try {
    const { geminiKey, openaiKey } = req.body;
    
    if (geminiKey) {
      apiKeys.gemini = geminiKey;
      console.log('✅ Gemini API 키 저장 완료');
    }
    
    if (openaiKey) {
      apiKeys.openai = openaiKey;
      console.log('✅ OpenAI API 키 저장 완료');
    }
    
    res.json({
      success: true,
      message: 'API 키가 저장되었습니다.',
      saved: {
        gemini: !!apiKeys.gemini,
        openai: !!apiKeys.openai
      }
    });
  } catch (error) {
    console.error('❌ API 키 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// API 키 조회 — 키 존재 여부만 반환 (값은 노출하지 않음)
app.get('/api-keys/get', (_req, res) => {
  try {
    res.json({
      success: true,
      apiKeys: {
        gemini: apiKeys.gemini ? '***' : null,
        openai: apiKeys.openai ? '***' : null
      }
    });
  } catch (error) {
    console.error('❌ API 키 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// API 키 삭제
app.delete('/api-keys/delete', (req, res) => {
  try {
    const { type } = req.query; // 'gemini' or 'openai'
    
    if (type === 'gemini') {
      apiKeys.gemini = null;
      console.log('🗑️ Gemini API 키 삭제 완료');
    } else if (type === 'openai') {
      apiKeys.openai = null;
      console.log('🗑️ OpenAI API 키 삭제 완료');
    } else if (!type) {
      // 모두 삭제
      apiKeys.gemini = null;
      apiKeys.openai = null;
      console.log('🗑️ 모든 API 키 삭제 완료');
    }
    
    res.json({
      success: true,
      message: 'API 키가 삭제되었습니다.'
    });
  } catch (error) {
    console.error('❌ API 키 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 콘텐츠 저장
app.post('/content/save', (req, res) => {
  try {
    const { title, content, category, postType, metadata } = req.body;
    
    // 유효성 검사
    if (!title || !content || !category || !postType) {
      return res.status(400).json({
        success: false,
        error: '필수 필드가 누락되었습니다. (title, content, category, postType)'
      });
    }
    
    // 콘텐츠 저장
    const newContent = {
      id: nextId++,
      title,
      content,
      category,
      postType,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    contents.push(newContent);
    
    console.log(`✅ 콘텐츠 저장 완료 - ID: ${newContent.id}, 제목: ${title}`);
    
    res.json({
      success: true,
      id: newContent.id,
      message: '콘텐츠가 성공적으로 저장되었습니다.'
    });
  } catch (error) {
    console.error('❌ 콘텐츠 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 콘텐츠 목록 조회
app.get('/content/list', (req, res) => {
  try {
    const { category, postType, limit = 50, offset = 0 } = req.query;
    
    let filteredContents = [...contents];
    
    // 필터링
    if (category) {
      filteredContents = filteredContents.filter(c => c.category === category);
    }
    if (postType) {
      filteredContents = filteredContents.filter(c => c.postType === postType);
    }
    
    // 최신순 정렬
    filteredContents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 페이지네이션
    const total = filteredContents.length;
    const paginatedContents = filteredContents.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );
    
    res.json({
      success: true,
      data: paginatedContents,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('❌ 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 특정 콘텐츠 조회
app.get('/content/:id', (req, res) => {
  try {
    const { id } = req.params;
    const content = contents.find(c => c.id === parseInt(id));
    
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '콘텐츠를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('❌ 콘텐츠 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 콘텐츠 삭제
app.delete('/content/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = contents.findIndex(c => c.id === parseInt(id));
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: '콘텐츠를 찾을 수 없습니다.'
      });
    }
    
    contents.splice(index, 1);
    
    console.log(`🗑️ 콘텐츠 삭제 완료 - ID: ${id}`);
    
    res.json({
      success: true,
      message: '콘텐츠가 삭제되었습니다.'
    });
  } catch (error) {
    console.error('❌ 콘텐츠 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 통계 조회
app.get('/stats', (req, res) => {
  try {
    const stats = {
      totalContents: contents.length,
      byPostType: {
        blog: contents.filter(c => c.postType === 'blog').length,
        card_news: contents.filter(c => c.postType === 'card_news').length,
        press_release: contents.filter(c => c.postType === 'press_release').length
      },
      byCategory: {}
    };
    
    // 카테고리별 통계
    contents.forEach(c => {
      stats.byCategory[c.category] = (stats.byCategory[c.category] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '요청하신 API를 찾을 수 없습니다.'
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  🏥 Hospital AI API Server                       ║
║  🚀 Server running on http://localhost:${PORT}     ║
║  📅 Started at: ${new Date().toLocaleString('ko-KR')}  ║
╚═══════════════════════════════════════════════════╝

Available Endpoints:
  GET    /health              - Health check
  POST   /content/save        - Save content
  GET    /content/list        - Get content list
  GET    /content/:id         - Get specific content
  DELETE /content/:id         - Delete content
  GET    /stats               - Get statistics
  `);
});

module.exports = app;
