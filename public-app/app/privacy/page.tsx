import type { Metadata } from 'next';

/**
 * 개인정보처리방침 페이지 (CMP-001a 골격)
 *
 * 본 페이지는 PIPA(개인정보보호법) 준수의 첫 단계로 추가된 **골격**이다.
 * 모든 법률 표현은 [TODO: 법무 검토] 마커로 표시되어 있으며,
 * 법무 검토 전까지 운영에 노출하면 안 된다 (route는 등록되지만 footer 링크 노출 시 주의).
 *
 * - 본문의 사실 항목은 docs/PII_INVENTORY.md 의 grep 결과를 기반으로 채워졌다.
 * - 회원탈퇴 흐름은 본 PR 범위 밖 (CMP-001b 별도 PR).
 * - 쿠키 배너는 별도 PR.
 */

export const metadata: Metadata = {
  title: '개인정보처리방침 | WINAI',
  description: 'WINAI(윈에이아이) 서비스의 개인정보처리방침. PIPA(개인정보보호법) 준수.',
  robots: {
    // 법무 검토 전까지 검색엔진 노출 차단
    index: false,
    follow: false,
  },
};

const TODO = (label: string) => (
  <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold rounded border border-amber-200 mr-1">
    [TODO: 법무 검토 — {label}]
  </span>
);

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16 leading-relaxed">
        {/* 헤더 */}
        <header className="mb-12 pb-8 border-b border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">
            개인정보처리방침
          </h1>
          <p className="text-sm text-slate-500">
            본 페이지는 골격(skeleton) 단계로, 법무 검토를 거쳐 본문이 확정될 때까지
            확정 효력이 없습니다. 운영 노출 전 법무팀 확인이 필요합니다.
          </p>
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <strong className="font-semibold">⚠ 골격 단계 안내</strong>
            <p className="mt-1">
              본 처리방침은 2026-05-06 최초 작성된 골격입니다. 노란 마커(
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded border border-amber-300">
                [TODO: 법무 검토]
              </span>
              )가 표시된 항목은 법무 검토 후 확정됩니다.
            </p>
          </div>
        </header>

        {/* 1. 수집·이용 목적 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            1. 개인정보의 수집·이용 목적
          </h2>
          <p className="text-slate-700 mb-3">
            (주)윈에이아이(이하 &ldquo;회사&rdquo;)는 다음 목적을 위해 개인정보를 수집·이용합니다.
            {TODO('목적 외 이용 금지 조항 문구')}
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-700">
            <li>회원 가입 및 본인 확인 (이메일·비밀번호 인증)</li>
            <li>병원 마케팅용 콘텐츠(블로그, 보도자료, 영상, 이미지) 생성 서비스 제공</li>
            <li>병원 홈페이지·블로그 SEO/AEO 진단 결과 제공</li>
            <li>병원별 글쓰기 말투 학습 및 자동 적용</li>
            <li>크레딧·결제·구독 관리</li>
            <li>서비스 이용량·오류 모니터링 및 부정 이용 방지</li>
            <li>고객 문의 응대 및 공지사항 전달 {TODO('마케팅 활용 목적 분리 필요')}</li>
          </ul>
        </section>

        {/* 2. 수집 항목 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            2. 수집하는 개인정보의 항목
          </h2>
          <p className="text-slate-700 mb-3">
            아래는 코드 인벤토리(<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">docs/PII_INVENTORY.md</code>)에 기반한
            현재 시점 수집 항목 목록입니다.
            {TODO('필수/선택 구분 및 미동의 시 제한 안내')}
          </p>

          <h3 className="text-base font-semibold text-slate-800 mt-5 mb-2">2-1. 회원가입 시 (필수)</h3>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>이메일</li>
            <li>비밀번호 (Supabase가 해시로 저장. 평문 비저장)</li>
            <li>병원명 (회원가입 시 &lsquo;병원명&rsquo; 입력란이 사용자명 metadata로 저장됨)</li>
          </ul>

          <h3 className="text-base font-semibold text-slate-800 mt-5 mb-2">2-2. 회원가입 시 (선택)</h3>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>병원 홈페이지/블로그 URL</li>
            <li>병원 주소</li>
            <li>아바타 이미지 URL (소셜 가입 시)</li>
          </ul>

          <h3 className="text-base font-semibold text-slate-800 mt-5 mb-2">2-3. 서비스 이용 중 자동 수집·생성</h3>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>접속 IP의 해시값 (게스트 사용량 제한·중복 가입 방지 목적, SHA256)</li>
            <li>사용 로그(생성한 콘텐츠 종류, 사용 토큰 수, 비용, 시각, action 타입)</li>
            <li>크레딧 잔액·구독 플랜·만료일 정보</li>
            <li>사용자가 입력·생성한 콘텐츠 본문(블로그/보도자료 제목·본문·키워드, 의사명·직함 등)</li>
            <li>병원 사이트 진단 결과(URL, 점수, 분석 JSON)</li>
            <li>업로드한 병원 이미지 메타데이터(파일명·크기·MIME·태그) 및 Storage 내 파일 자체</li>
            <li>업로드한 영상 파일(처리용으로 영상 처리 서버에 전송) {TODO('영상의 임시 보관 기간 명시 필요')}</li>
            <li>사용자가 자기 병원 네이버 블로그를 학습 대상으로 등록한 경우, 해당 블로그의 공개 게시글 텍스트</li>
            <li>사용자가 작성한 블로그 본문의 임베딩 벡터 (유사도 검사 용도)</li>
            <li>사용자가 남긴 내부 피드백(작성자명·본문)</li>
          </ul>

          <h3 className="text-base font-semibold text-slate-800 mt-5 mb-2">2-4. 결제 시</h3>
          <p className="text-slate-700">
            결제 정보는 결제대행사(PG)를 통해 처리되며, 회사는 결제 결과(금액, 결제수단 종류, 거래 ID, 상태)만을 보관합니다.
            카드번호 등 결제수단 자체의 정보는 회사가 직접 보관하지 않습니다.
            {TODO('실제 PG 연동 사업자명·전송 항목 확정 필요. 현재 코드상 결제 흐름 미구현 상태로 확인됨')}
          </p>

          <h3 className="text-base font-semibold text-slate-800 mt-5 mb-2">2-5. 브라우저 LocalStorage</h3>
          <p className="text-slate-700">
            로그인 화면의 &ldquo;로그인 정보 기억&rdquo; 옵션을 선택한 경우, 이메일 주소가 사용자 기기의
            브라우저 LocalStorage(<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">winaid_remember_email</code>)에 저장됩니다.
            서버에는 별도 저장되지 않으며, 사용자가 브라우저 데이터를 삭제하면 함께 삭제됩니다.
          </p>
        </section>

        {/* 3. 보유 및 이용기간 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            3. 개인정보의 보유 및 이용기간
          </h2>
          <p className="text-slate-700 mb-3">
            {TODO('항목별 보유 기간 정의 — 회원 정보, 결제 기록(전자상거래법 5년), 사용 로그, 콘텐츠, 진단 이력, 이미지 등을 법무팀이 PIPA·전자상거래법·통신비밀보호법 기준으로 확정')}
          </p>
          <p className="text-slate-700">
            다만 다음 데이터는 코드상 자동 삭제·로테이션 정책이 확인되었습니다:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-slate-700 mt-2">
            <li>병원 학습용 크롤링 게시글: 출처 블로그별 최신 10건 초과 시 가장 오래된 항목부터 자동 삭제</li>
          </ul>
          <p className="text-slate-700 mt-3">
            그 외 항목은 현재 보존 기간 자동 만료 정책이 코드상 정의되어 있지 않습니다.
            {TODO('법무 확정 후 정책 추가 PR 별도 진행 예정')}
          </p>
        </section>

        {/* 4. 제3자 제공 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            4. 개인정보의 제3자 제공
          </h2>
          <p className="text-slate-700">
            회사는 정보주체의 별도 동의 또는 법령에 근거가 있는 경우 외에는 개인정보를 제3자에게 제공하지 않습니다.
            {TODO('현재 제3자 제공 사례 없음을 단언할지 / 개별 동의 시 절차 명시 여부')}
          </p>
        </section>

        {/* 5. 처리위탁 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            5. 개인정보 처리위탁
          </h2>
          <p className="text-slate-700 mb-3">
            서비스 제공을 위해 다음과 같이 개인정보 처리를 외부에 위탁하고 있습니다.
            {TODO('국외 이전 동의 절차 (Google·Anthropic·OpenAI는 미국 소재)')}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">수탁자</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">위탁 업무</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">전송 데이터</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Supabase, Inc.</td>
                  <td className="border border-slate-200 px-3 py-2">DB·인증·파일 저장 인프라</td>
                  <td className="border border-slate-200 px-3 py-2">회원 정보, 콘텐츠, 이미지 등 서비스 데이터 일체</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Anthropic, PBC (Claude)</td>
                  <td className="border border-slate-200 px-3 py-2">텍스트 콘텐츠 생성 LLM</td>
                  <td className="border border-slate-200 px-3 py-2">사용자가 입력한 prompt(병원명·주제·키워드 등)</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Google LLC (Gemini, Cloud Speech)</td>
                  <td className="border border-slate-200 px-3 py-2">텍스트·이미지 분석, 영상 자막 STT</td>
                  <td className="border border-slate-200 px-3 py-2">prompt, 영상 음성</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">OpenAI, L.L.C.</td>
                  <td className="border border-slate-200 px-3 py-2">이미지 생성, AEO 진단</td>
                  <td className="border border-slate-200 px-3 py-2">이미지 생성 prompt, 진단용 사이트 URL</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Kaleido AI GmbH (remove.bg)</td>
                  <td className="border border-slate-200 px-3 py-2">이미지 배경 제거</td>
                  <td className="border border-slate-200 px-3 py-2">사용자 업로드 이미지</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">자체 운영 영상 처리 서버 (Railway)</td>
                  <td className="border border-slate-200 px-3 py-2">영상 편집·렌더링</td>
                  <td className="border border-slate-200 px-3 py-2">사용자 업로드 영상</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">자체 운영 크롤러 서버 (Railway)</td>
                  <td className="border border-slate-200 px-3 py-2">사용자 등록 블로그 크롤링</td>
                  <td className="border border-slate-200 px-3 py-2">사용자가 입력한 블로그 URL</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">NAVER Corp.</td>
                  <td className="border border-slate-200 px-3 py-2">검색 API (블로그·뉴스·검색량)</td>
                  <td className="border border-slate-200 px-3 py-2">검색어 query (PII 미포함)</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Pexels, Pixabay, Google CSE</td>
                  <td className="border border-slate-200 px-3 py-2">이미지/영상 소재 검색</td>
                  <td className="border border-slate-200 px-3 py-2">검색어 query (PII 미포함)</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-3 py-2">Jamendo S.A., Hugging Face, Inc.</td>
                  <td className="border border-slate-200 px-3 py-2">음악 검색·생성 (선택 사용)</td>
                  <td className="border border-slate-200 px-3 py-2">검색어/생성 prompt</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-slate-700 mt-3 text-sm">
            {TODO('각 수탁자의 보유·파기 기준, 국외 이전 시 이전국가/일시/방법/근거 명시')}
          </p>
        </section>

        {/* 6. 정보주체의 권리 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            6. 정보주체의 권리·의무 및 그 행사방법
          </h2>
          <p className="text-slate-700 mb-3">
            정보주체는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.
            {TODO('PIPA 제35~37조에 따른 권리 행사 절차·접수 방법·처리 기한 명시')}
          </p>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>마이페이지에서 본인 프로필 정보(이름·병원명·홈페이지 URL·주소) 열람·수정 가능</li>
            <li>회원탈퇴(처리정지·삭제) 절차는 별도 PR(CMP-001b)에서 구현 예정. 현재는 아래 &ldquo;개인정보 보호책임자&rdquo;에게 이메일로 문의해 주십시오.</li>
            <li>{TODO('대리인을 통한 권리 행사 절차')}</li>
          </ul>
        </section>

        {/* 7. 안전성 확보조치 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            7. 개인정보의 안전성 확보조치
          </h2>
          <p className="text-slate-700 mb-3">
            회사는 다음과 같은 기술적·관리적 조치를 시행하고 있습니다.
            {TODO('PIPA 시행령 제30조 기준에 맞춘 항목별 상세화')}
          </p>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>비밀번호 단방향 해시 보관(Supabase Auth)</li>
            <li>데이터베이스 Row Level Security(RLS) 정책 적용</li>
            <li>전송 구간 TLS 암호화</li>
            <li>접속 IP는 SHA256 해시 처리 후 보관</li>
            <li>{TODO('접속기록 보관·점검 주기, 침해사고 대응 절차, 내부 관리계획 등 추가')}</li>
          </ul>
        </section>

        {/* 8. 개인정보 보호책임자 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            8. 개인정보 보호책임자
          </h2>
          <p className="text-slate-700 mb-3">
            {TODO('PIPA 제31조에 따른 보호책임자 지정 — 성명·직책·연락처. 아래는 회사 대표 연락처 임시 표기')}
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
            <p>회사명: (주)윈에이아이</p>
            <p>대표: 이현승</p>
            <p>주소: (07206) 서울 영등포구 양평로20길 16-1 2층</p>
            <p>이메일: <a href="mailto:winaid@daum.net" className="text-blue-600 hover:underline">winaid@daum.net</a></p>
            <p>전화: 02-584-9400</p>
          </div>
        </section>

        {/* 9. 처리방침 변경 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            9. 개인정보처리방침의 변경
          </h2>
          <p className="text-slate-700 mb-3">
            본 처리방침은 법령·정책 또는 보안기술의 변경에 따라 내용이 추가·삭제 및 수정될 수 있으며,
            변경 시 시행일 7일 전부터 본 페이지를 통해 공지합니다.
            {TODO('중요한 변경 시 별도 동의 재취득 절차 명시 여부')}
          </p>
          <h3 className="text-base font-semibold text-slate-800 mt-4 mb-2">변경 이력</h3>
          <ul className="list-disc pl-6 space-y-1 text-slate-700 text-sm">
            <li>2026-05-06 — 최초 작성 (골격 단계, 법무 검토 진행 중)</li>
          </ul>
        </section>

        {/* 10. 권익침해 구제 */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            10. 정보주체의 권익침해에 대한 구제방법
          </h2>
          <p className="text-slate-700 mb-3">
            개인정보 침해로 인한 신고나 상담이 필요하신 경우 아래 기관에 문의하실 수 있습니다.
            {TODO('각 기관 안내 문구 정확 표기 — 개인정보분쟁조정위원회, KISA 개인정보침해 신고센터, 대검찰청, 경찰청 등')}
          </p>
          <ul className="list-disc pl-6 space-y-1 text-slate-700">
            <li>{TODO('개인정보분쟁조정위원회 — 1833-6972 / kopico.go.kr')}</li>
            <li>{TODO('한국인터넷진흥원(KISA) 개인정보침해 신고센터 — 118 / privacy.kisa.or.kr')}</li>
            <li>{TODO('대검찰청 사이버수사과 / 경찰청 사이버수사국')}</li>
          </ul>
        </section>

        {/* 회원탈퇴 안내 */}
        <section className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-base font-bold text-slate-900 mb-2">회원탈퇴 절차 안내</h2>
          <p className="text-sm text-slate-700">
            회원탈퇴 절차는 별도 PR(CMP-001b)에서 구현 예정입니다.
            현재는 위 &ldquo;개인정보 보호책임자&rdquo;에게 이메일(<a href="mailto:winaid@daum.net" className="text-blue-600 hover:underline">winaid@daum.net</a>)로
            문의해 주시면 관리자가 직접 처리합니다.
          </p>
        </section>

        {/* 푸터 */}
        <footer className="pt-8 border-t border-slate-200 text-xs text-slate-400">
          <p>본 페이지는 골격(skeleton) 단계입니다. 법무 검토 후 확정됩니다.</p>
          <p className="mt-1">최종 수정: 2026-05-06</p>
        </footer>
      </div>
    </main>
  );
}
