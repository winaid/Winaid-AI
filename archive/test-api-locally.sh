#!/bin/bash

echo "🧪 로컬 네이버 API 테스트"
echo ""

# 테스트 1: 일반 검색
echo "📍 테스트 1: 일반 검색 (query=관절염)"
curl -s "http://localhost:8788/api/naver-news?query=관절염&display=2" | jq -r '.items[] | "제목: \(.title | gsub("<[^>]*>"; ""))"'
echo ""

# 테스트 2: 파라미터 없음
echo "📍 테스트 2: query 파라미터 없음 (400 에러 예상)"
curl -s "http://localhost:8788/api/naver-news?display=2" | jq '.'
echo ""

# 테스트 3: 다른 키워드
echo "📍 테스트 3: 다른 키워드 (query=피부관리)"
curl -s "http://localhost:8788/api/naver-news?query=피부관리&display=2" | jq -r '.total, .items[] | "제목: \(.title | gsub("<[^>]*>"; ""))"' 2>/dev/null | head -3
echo ""

echo "✅ 모든 테스트 완료!"
