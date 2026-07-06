import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개",
  description:
    "시세(sise.today)는 국토부 아파트 실거래가를 매일 가공해 신고가·반등 시그널을 빠르게 보여주는 서비스입니다. 시그널의 의미와 사용법을 안내합니다.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="max-w-none text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight mb-3">시세 소개</h1>

      <p className="mb-4">
        <b>시세(sise.today)</b>는 국토교통부 아파트 매매 실거래가를 매일 가공해, 그날 시장에서 의미 있게
        움직인 거래를 <b>신고가·반등 시그널</b>로 빠르게 보여주는 서비스입니다. 호갱노노·아실 같은 종합
        플랫폼과 달리, 범위를 <b>아파트 매매 실거래</b>로 좁히고 &ldquo;오늘 뭐가 움직였나&rdquo;를 한눈에,
        그리고 카페·단톡방에 그대로 공유하기 쉽게 만드는 데 집중합니다.
      </p>

      <h2 className="text-base font-semibold mt-6 mb-1">시그널이란?</h2>
      <p className="mb-2">
        매일 전국에서 아파트 실거래가 수천 건 신고됩니다. 그 더미 속에서 <b>주목할 만한 거래만 자동으로
        골라낸 것</b>이 시그널입니다. 시세가 잡는 시그널은 두 가지입니다.
      </p>
      <div className="space-y-3 mb-4">
        <div>
          <p className="font-semibold text-[var(--red)]">신고가 — 역대 최고가 갱신</p>
          <p>
            그 단지·평형이 지금까지 거래된 가격 중 가장 높을 때입니다. 예를 들어 어떤 아파트 31평이 줄곧
            28억대였는데 오늘 30억에 거래됐다면, 역대 최고가를 새로 쓴 &lsquo;신고가&rsquo;입니다.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--blue)]">반등 — 전고점 가까이 회복</p>
          <p>
            신고가는 아니지만, 직전 거래보다 오르고 과거 최고가(전고점)의 90% 이상을 회복했을 때입니다.
            전고점 25억을 찍고 20억까지 빠졌던 단지가 23.5억에 거래되면, 전고점 대비 94% 회복한
            &lsquo;반등&rsquo;입니다.
          </p>
        </div>
      </div>
      <p className="mb-4 text-[var(--ink-soft)]">
        모든 시그널은 해당 거래 <b>이전</b>의 같은 그룹(단지+지역+평형) 거래만으로 계산하며, 취소거래는
        제외합니다.
      </p>

      <h2 className="text-base font-semibold mt-6 mb-1">메뉴 안내</h2>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        <li><b>시그널 TOP</b> — 오늘의 신고가·반등과 최근 7일 TOP</li>
        <li><b>지역별</b> — 시군구를 골라 그 지역의 신고가·반등 보기</li>
        <li><b>단지 조회</b> — 단지별 실거래가 전체 이력과 시세 추이 차트</li>
        <li><b>다이제스트</b> — 오늘의 시그널을 카페·단톡방에 그대로 복붙하거나 이미지로 공유</li>
      </ul>

      <h2 className="text-base font-semibold mt-6 mb-1">색상 규칙</h2>
      <p className="mb-4">
        한국 관습을 따라 <span className="text-[var(--red)] font-medium">상승·신고가는 빨강</span>,{" "}
        <span className="text-[var(--blue)] font-medium">하락·직거래는 파랑</span>으로 표시합니다.
      </p>

      <h2 className="text-base font-semibold mt-6 mb-1">데이터 처리 원칙</h2>
      <p className="mb-2">
        신뢰할 수 있는 시그널을 위해 다음 원칙으로 데이터를 다룹니다.
      </p>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        <li><b>매일 수집</b> — 국토부 공개 데이터를 매일 새벽 수집하며, 신고 지연(계약 후 30일 이내 신고)에 대비해 최근 몇 개월치를 다시 확인합니다.</li>
        <li><b>취소거래 보존·제외</b> — 취소된 거래는 지우지 않고 취소 표시로 남기되, 신고가·반등 판정에서는 제외합니다. 자전거래 등 왜곡 흔적을 추적하기 위함입니다.</li>
        <li><b>직거래 기본 제외</b> — 특수관계인 간 거래 등이 섞일 수 있는 직거래는 시그널·집계에서 기본 제외하고 이력에는 구분 표시합니다.</li>
        <li><b>이전 거래만으로 판정</b> — 전고점·직전가는 해당 거래 이전의 같은 단지·평형 거래만으로 계산합니다. 자기 자신을 포함하면 판정이 왜곡되기 때문입니다.</li>
        <li><b>입주권·분양권 반영</b> — 등기 전 신축 단지의 거래 공백을 메우기 위해 권리 거래도 수집해 단지 이력에 반영합니다.</li>
      </ul>

      <h2 className="text-base font-semibold mt-6 mb-1">운영과 문의</h2>
      <p className="mb-4">
        시세는 개인이 운영하는 독립 서비스로, 특정 중개업소·건설사·금융사와 이해관계가 없습니다.
        데이터 오류 제보나 기능 제안은{" "}
        <Link href="/feedback" className="underline hover:no-underline">의견 보내기</Link>로 알려주시면
        확인 후 반영합니다.
      </p>

      <h2 className="text-base font-semibold mt-6 mb-1">데이터 출처와 면책</h2>
      <p className="mb-4">
        모든 정보는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로, 정부 공식 서비스가 아니며
        정보의 정확성·완전성을 보장하지 않습니다. 평형 등 일부 값은 추정치이며, 직거래·취소거래는 시세
        왜곡을 막기 위해 화면·집계에서 기본 제외됩니다. 제공 정보를 활용한 투자 판단의 책임은 이용자에게
        있습니다.
      </p>

      <p className="text-xs text-[var(--ink-soft)] mt-8 flex gap-3">
        <Link href="/" className="hover:underline">← 홈으로</Link>
        <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
      </p>
    </article>
  );
}
