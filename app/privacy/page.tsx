import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "시세(sise.today) 개인정보처리방침 — 수집 정보, 쿠키 및 제3자 광고, 데이터 출처와 면책.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "2026-06-14";

export default function PrivacyPage() {
  return (
    <article className="prose-sise max-w-2xl text-sm leading-relaxed text-[var(--ink)]">
      <h1 className="text-2xl font-bold tracking-tight mb-1">개인정보처리방침</h1>
      <p className="text-xs text-[var(--ink-soft)] mb-6">시행일: {UPDATED}</p>

      <Section title="1. 개요">
        시세(<b>sise.today</b>, 이하 “서비스”)는 회원가입·로그인 없이 운영되며, 이름·연락처·주민등록번호 등
        개인을 직접 식별하는 정보를 수집하지 않습니다. 다만 방문 분석과 광고 게재 과정에서 쿠키 및
        기기·브라우저 정보가 자동으로 처리될 수 있습니다.
      </Section>

      <Section title="2. 자동으로 수집되는 정보">
        서비스 이용 시 IP 주소, 브라우저·기기 종류, 방문 페이지·접속 시각 등이 쿠키 또는 유사 기술을 통해
        자동 수집·처리될 수 있습니다. 이는 서비스 개선과 광고 게재를 위한 것이며 개인을 특정하는 데 사용되지
        않습니다.
      </Section>

      <Section title="3. 쿠키 및 제3자 광고 (Google AdSense)">
        본 서비스는 향후 Google AdSense 등 제3자 광고를 게재할 수 있습니다. Google을 포함한 제3자 광고
        공급업체는 쿠키를 사용해 이용자의 이전 방문 기록을 바탕으로 맞춤형 광고를 표시할 수 있습니다.
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            Google의 광고 쿠키 사용에 대한 안내:{" "}
            <ExtLink href="https://policies.google.com/technologies/ads">policies.google.com/technologies/ads</ExtLink>
          </li>
          <li>
            맞춤형 광고 거부(Google 광고 설정):{" "}
            <ExtLink href="https://adssettings.google.com">adssettings.google.com</ExtLink>
          </li>
          <li>
            제3자 쿠키 일괄 거부:{" "}
            <ExtLink href="https://www.aboutads.info/choices">aboutads.info/choices</ExtLink>
          </li>
        </ul>
        <p className="mt-2">
          브라우저 설정에서 쿠키를 차단하거나 삭제할 수 있으며, 이 경우 일부 기능이 제한될 수 있습니다.
        </p>
      </Section>

      <Section title="4. 방문 분석">
        서비스 개선을 위해 방문 통계 분석 도구를 사용할 수 있습니다. 해당 도구는 개인을
        식별하지 않는 집계 통계(방문 수, 페이지 조회 등)만을 수집합니다.
      </Section>

      <Section title="5. 데이터 출처 및 면책">
        본 서비스가 제공하는 아파트 실거래가 정보는 <b>국토교통부 실거래가 공개시스템</b> 데이터를 가공한
        것으로, 정부 공식 서비스가 아니며 정보의 정확성·완전성을 보장하지 않습니다. 평형은 추정치이며, 모든
        투자 판단의 책임은 이용자에게 있습니다.
      </Section>

      <Section title="6. 처리 위탁 / 제3자 서비스">
        서비스 운영을 위해 호스팅·분석 제공업체, 데이터베이스(Supabase), 파일 저장(Cloudflare R2),
        광고(Google AdSense, 도입 시) 등 외부 서비스를 이용합니다. 각 서비스는 자체 개인정보처리방침을 따릅니다.
      </Section>

      <Section title="7. 이용자의 권리">
        이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으며, 위 3항의 링크를 통해 맞춤형 광고를 거부할
        수 있습니다. 본 서비스는 회원 개인정보를 직접 보관하지 않으므로 열람·정정·삭제 대상 개인정보가 존재하지
        않습니다.
      </Section>

      <Section title="8. 정책 변경">
        본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 변경 시 본 페이지에 시행일과 함께 게시합니다.
      </Section>

      <Section title="9. 문의">
        개인정보 처리에 관한 문의:{" "}
        <a className="text-[var(--blue)] hover:underline" href="mailto:jsypsy@gmail.com">
          jsypsy@gmail.com
        </a>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <div className="text-[var(--ink-soft)]">{children}</div>
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--blue)] hover:underline">
      {children}
    </a>
  );
}
